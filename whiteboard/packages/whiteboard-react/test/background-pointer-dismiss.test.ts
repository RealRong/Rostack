import { describe, expect, it, vi } from 'vitest'
import { dismissBackgroundEditSelection } from '../src/runtime/whiteboard/pointerDown'

describe('dismissBackgroundEditSelection', () => {
  it('commits edit and clears selection on primary background press', () => {
    const commit = vi.fn()
    const clear = vi.fn()

    dismissBackgroundEditSelection({
      editor: {
        session: {
          edit: {
            get: () => ({
              kind: 'node',
              nodeId: 'node-1',
              field: 'text',
              text: 'Hello',
              composing: false,
              caret: {
                kind: 'end'
              }
            })
          },
          selection: {
            get: () => ({
              nodeIds: ['node-1'],
              edgeIds: []
            })
          }
        },
        write: {
          edit: {
            commit
          },
          selection: {
            clear
          }
        }
      } as never,
      input: {
        button: 0,
        pick: {
          kind: 'background'
        },
        editable: false,
        ignoreInput: false,
        ignoreSelection: false
      } as never
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
      editor: {
        session: {
          edit: {
            get: () => ({
              kind: 'node',
              nodeId: 'node-1',
              field: 'text',
              text: 'Hello',
              composing: false,
              caret: {
                kind: 'end'
              }
            })
          },
          selection: {
            get: () => ({
              nodeIds: [],
              edgeIds: []
            })
          }
        },
        write: {
          edit: {
            commit
          },
          selection: {
            clear
          }
        }
      } as never,
      input: {
        button: 0,
        pick: {
          kind: 'background'
        },
        editable: false,
        ignoreInput: false,
        ignoreSelection: false
      } as never
    })

    expect(commit).toHaveBeenCalledTimes(1)
    expect(clear).not.toHaveBeenCalled()
  })

  it('ignores non-background presses and inactive edits', () => {
    const commit = vi.fn()
    const clear = vi.fn()

    dismissBackgroundEditSelection({
      editor: {
        session: {
          edit: {
            get: () => null
          },
          selection: {
            get: () => ({
              nodeIds: ['node-1'],
              edgeIds: []
            })
          }
        },
        write: {
          edit: {
            commit
          },
          selection: {
            clear
          }
        }
      } as never,
      input: {
        button: 0,
        pick: {
          kind: 'background'
        },
        editable: false,
        ignoreInput: false,
        ignoreSelection: false
      } as never
    })

    dismissBackgroundEditSelection({
      editor: {
        session: {
          edit: {
            get: () => ({
              kind: 'node',
              nodeId: 'node-1',
              field: 'text',
              text: 'Hello',
              composing: false,
              caret: {
                kind: 'end'
              }
            })
          },
          selection: {
            get: () => ({
              nodeIds: ['node-1'],
              edgeIds: []
            })
          }
        },
        write: {
          edit: {
            commit
          },
          selection: {
            clear
          }
        }
      } as never,
      input: {
        button: 0,
        pick: {
          kind: 'node',
          id: 'node-1',
          part: 'body'
        },
        editable: false,
        ignoreInput: false,
        ignoreSelection: false
      } as never
    })

    expect(commit).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })
})
