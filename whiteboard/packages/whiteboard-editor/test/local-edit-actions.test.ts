import { describe, expect, it } from 'vitest'
import { createEditState } from '../src/local/session/edit'
import { createLocalEditActions } from '../src/local/actions/edit'
import type { LayoutRuntime } from '../src/layout/runtime'

const createRegistry = () => ({
  get: () => ({
    layout: {
      kind: 'size' as const
    },
    edit: {
      fields: {
        text: {
          multiline: true,
          empty: 'remove' as const
        }
      }
    }
  })
})

const createLayout = (): LayoutRuntime => ({
  patchNodeUpdate: (_, update) => update,
  syncNode: () => undefined,
  editNode: ({ nodeId }) => nodeId === 'node-1'
    ? {
        size: {
          width: 180,
          height: 48
        },
        wrapWidth: 180
      }
    : nodeId === 'node-2'
      ? {
          size: {
            width: 120,
            height: 24
          }
        }
      : undefined,
  resolvePreviewPatches: (patches) => patches
})

describe('createLocalEditActions.startNode', () => {
  it('seeds wrap width from the current rect when wrap text has no persisted wrapWidth', () => {
    const state = {
      edit: createEditState()
    }
    const actions = createLocalEditActions({
      state,
      registry: createRegistry(),
      getLayout: () => createLayout(),
      getRead: () => ({
        node: {
          item: new Map([
            ['node-1', {
              node: {
                id: 'node-1',
                type: 'text',
                position: { x: 0, y: 0 },
                size: { width: 96, height: 24 },
                data: {
                  text: 'wrapped',
                  widthMode: 'wrap'
                }
              },
              rect: {
                x: 10,
                y: 20,
                width: 180,
                height: 48
              }
            }]
          ])
        },
        edge: {
          item: new Map()
        }
      })
    })

    actions.startNode('node-1', 'text')

    expect(state.edit.source.get()).toMatchObject({
      kind: 'node',
      nodeId: 'node-1',
      layout: {
        wrapWidth: 180,
        size: {
          width: 180,
          height: 48
        }
      }
    })
  })

  it('keeps auto text unconstrained when entering edit mode', () => {
    const state = {
      edit: createEditState()
    }
    const actions = createLocalEditActions({
      state,
      registry: createRegistry(),
      getLayout: () => createLayout(),
      getRead: () => ({
        node: {
          item: new Map([
            ['node-2', {
              node: {
                id: 'node-2',
                type: 'text',
                position: { x: 0, y: 0 },
                size: { width: 120, height: 24 },
                data: {
                  text: 'auto'
                }
              },
              rect: {
                x: 0,
                y: 0,
                width: 120,
                height: 24
              }
            }]
          ])
        },
        edge: {
          item: new Map()
        }
      })
    })

    actions.startNode('node-2', 'text')

    expect(state.edit.source.get()).toMatchObject({
      kind: 'node',
      nodeId: 'node-2',
      layout: {
        wrapWidth: undefined,
        size: {
          width: 120,
          height: 24
        }
      }
    })
  })
})
