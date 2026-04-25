import { describe, expect, it, vi } from 'vitest'
import { createEditorSceneRuntime } from '@whiteboard/editor-scene'
import { createEditorBoundaryRuntime } from '../src/boundary/runtime'
import { createEditorBoundaryTaskRuntime } from '../src/boundary/task'
import { createEmptyEditorGraphInputDelta } from '../src/projection/input'

describe('editor boundary runtime', () => {
  const createBoundary = () => {
    const graph = createEditorSceneRuntime()
    const mark = vi.fn()
    const flush = vi.fn(() => null)
    let boundary!: ReturnType<typeof createEditorBoundaryRuntime>
    const tasks = createEditorBoundaryTaskRuntime({
      execute: (procedure) => {
        boundary.execute(procedure)
      }
    })

    boundary = createEditorBoundaryRuntime({
      projection: {
        current: () => ({
          snapshot: graph.snapshot(),
          result: null
        }),
        mark,
        flush
      },
      tasks
    })

    return {
      boundary,
      flush,
      mark
    }
  }

  it('flushes after atomic calls', () => {
    const { boundary, flush } = createBoundary()
    const run = boundary.atomic((value: number) => value * 2)

    expect(run(3)).toBe(6)
    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('interprets publish requests and passes published snapshots back into procedures', () => {
    const { boundary, flush, mark } = createBoundary()
    const delta = createEmptyEditorGraphInputDelta()
    delta.ui.draw = true

    const run = boundary.procedure(() => (function* () {
      const published = yield {
        kind: 'publish' as const,
        delta
      }

      return published.revision
    })())

    expect(run()).toBe(0)
    expect(mark).toHaveBeenCalledWith(delta)
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('schedules microtask continuations through the shared task runtime', async () => {
    const { boundary } = createBoundary()
    const calls: string[] = []

    const run = boundary.procedure(() => (function* () {
      calls.push('start')
      yield {
        kind: 'task' as const,
        lane: 'microtask' as const,
        procedure: (function* () {
          calls.push('microtask')
        })()
      }
      calls.push('end')
    })())

    run()
    expect(calls).toEqual([
      'start',
      'end'
    ])

    await Promise.resolve()

    expect(calls).toEqual([
      'start',
      'end',
      'microtask'
    ])
  })
})
