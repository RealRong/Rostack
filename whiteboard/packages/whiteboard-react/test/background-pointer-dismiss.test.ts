import { describe, expect, it, vi } from 'vitest'
import { dismissBackgroundEditSelection } from '../src/runtime/whiteboard/pointerDown'

type DismissInput = Parameters<typeof dismissBackgroundEditSelection>[0]
type DismissEditor = DismissInput['editor']
type PointerDownInput = DismissInput['input']

const createBackgroundInput = (): PointerDownInput => ({
  button: 0,
  pick: {
    kind: 'background'
  },
  editable: false,
  ignoreInput: false,
  ignoreSelection: false,
  client: { x: 0, y: 0 },
  screen: { x: 0, y: 0 },
  world: { x: 0, y: 0 },
  modifiers: {
    alt: false,
    shift: false,
    ctrl: false,
    meta: false
  },
  phase: 'down',
  detail: 1,
  pointerId: 1,
  buttons: 1,
  samples: []
})

const createEditor = (input: {
  edit: DismissEditor['scene']['ui']['state']['edit']['get']
  selection: DismissEditor['scene']['ui']['state']['selection']['get']
  commit: () => void
  clear: () => void
}): DismissEditor => ({
  scene: {
    ui: {
      state: {
        edit: {
          get: input.edit
        },
        selection: {
          get: input.selection
        }
      }
    }
  },
  actions: {
    session: {
      edit: {
        commit: input.commit
      },
      selection: {
        clear: input.clear
      }
    }
  }
})

describe('dismissBackgroundEditSelection', () => {
  it('commits edit and clears selection on primary background press', () => {
    const commit = vi.fn()
    const clear = vi.fn()

    dismissBackgroundEditSelection({
      editor: createEditor({
        edit: () => ({
          kind: 'node',
          nodeId: 'node-1',
          field: 'text',
          text: 'Hello',
          composing: false,
          caret: {
            kind: 'end'
          }
        }),
        selection: () => ({
          nodeIds: ['node-1'],
          edgeIds: []
        }),
        commit,
        clear
      }),
      input: createBackgroundInput()
    })

    expect(commit).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledTimes(1)
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      clear.mock.invocationCallOrder[0]!
    )
  })

  it('only commits when selection is already empty', () => {
    const commit = vi.fn()
    const clear = vi.fn()

    dismissBackgroundEditSelection({
      editor: createEditor({
        edit: () => ({
          kind: 'node',
          nodeId: 'node-1',
          field: 'text',
          text: 'Hello',
          composing: false,
          caret: {
            kind: 'end'
          }
        }),
        selection: () => ({
          nodeIds: [],
          edgeIds: []
        }),
        commit,
        clear
      }),
      input: createBackgroundInput()
    })

    expect(commit).toHaveBeenCalledTimes(1)
    expect(clear).not.toHaveBeenCalled()
  })

  it('ignores non-background presses and inactive edits', () => {
    const commit = vi.fn()
    const clear = vi.fn()

    dismissBackgroundEditSelection({
      editor: createEditor({
        edit: () => null,
        selection: () => ({
          nodeIds: ['node-1'],
          edgeIds: []
        }),
        commit,
        clear
      }),
      input: createBackgroundInput()
    })

    dismissBackgroundEditSelection({
      editor: createEditor({
        edit: () => ({
          kind: 'node',
          nodeId: 'node-1',
          field: 'text',
          text: 'Hello',
          composing: false,
          caret: {
            kind: 'end'
          }
        }),
        selection: () => ({
          nodeIds: ['node-1'],
          edgeIds: []
        }),
        commit,
        clear
      }),
      input: {
        ...createBackgroundInput(),
        pick: {
          kind: 'node',
          id: 'node-1',
          part: 'body'
        }
      }
    })

    expect(commit).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })
})
