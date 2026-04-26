import { describe, expect, it, vi } from 'vitest'
import { createChangeState } from '@shared/delta'
import { createEditorSceneRuntime } from '@whiteboard/editor-scene'
import { sceneInputChangeSpec } from '@whiteboard/editor-scene/contracts/change'
import { createEditorBoundaryRuntime } from '../src/boundary/runtime'
import { createEditorBoundaryTaskRuntime } from '../src/boundary/task'

describe('editor boundary runtime', () => {
  const createBoundary = () => {
    const graph = createEditorSceneRuntime({
      view: () => ({
        zoom: 1,
        center: {
          x: 0,
          y: 0
        },
        worldRect: {
          x: 0,
          y: 0,
          width: 0,
          height: 0
        }
      })
    })
    const mark = vi.fn()
    const flush = vi.fn(() => null)
    let boundary!: ReturnType<typeof createEditorBoundaryRuntime>
    const tasks = createEditorBoundaryTaskRuntime({
      execute: (procedure) => {
        boundary.execute(procedure)
      }
    })

    boundary = createEditorBoundaryRuntime({
      scene: {
        current: () => ({
          revision: graph.revision(),
          state: graph.state(),
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
    const delta = createChangeState(sceneInputChangeSpec)
    delta.session.preview.draw = true

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
