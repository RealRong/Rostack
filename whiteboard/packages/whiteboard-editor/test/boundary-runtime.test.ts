import { describe, expect, it, vi } from 'vitest'
import type { EditorSceneSourceChange } from '@whiteboard/editor-scene'
import { createEditorBoundaryRuntime } from '../src/boundary/runtime'
import { createEditorBoundaryTaskRuntime } from '../src/boundary/task'

describe('editor boundary runtime', () => {
  const createBoundary = () => {
    const publish = vi.fn()
    let boundary!: ReturnType<typeof createEditorBoundaryRuntime>
    const tasks = createEditorBoundaryTaskRuntime({
      execute: (procedure) => {
        boundary.execute(procedure)
      }
    })

    boundary = createEditorBoundaryRuntime({
      scene: {
        current: () => ({
          revision: 0,
          state: {
            graph: {} as never,
            items: [],
            ui: {} as never
          } as never
        }),
        publish
      },
      tasks
    })

    return {
      boundary,
      publish
    }
  }

  it('runs atomic calls directly', () => {
    const { boundary, publish } = createBoundary()
    const run = boundary.atomic((value: number) => value * 2)

    expect(run(3)).toBe(6)
    expect(publish).not.toHaveBeenCalled()
  })

  it('interprets publish requests and passes published snapshots back into procedures', () => {
    const { boundary, publish } = createBoundary()
    const change: EditorSceneSourceChange = {
      clock: true
    }

    const run = boundary.procedure(() => (function* () {
      const published = yield {
        kind: 'publish' as const,
        change
      }

      return published.revision
    })())

    expect(run()).toBe(0)
    expect(publish).toHaveBeenCalledWith(change)
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
