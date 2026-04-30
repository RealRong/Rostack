import { describe, expect, it, vi } from 'vitest'
import { createMoveInteraction } from '../src/input/features/selection/move'

describe('createMoveInteraction', () => {
  it('commits selection move through a single canvas write', () => {
    const moveSelection = vi.fn(() => ({ ok: true }))

    const session = createMoveInteraction({
      engine: {},
      document: {
        node: {
          get: () => ({
            node: {
              id: 'node-1',
              type: 'text',
              data: {
                text: 'node-1'
              }
            },
            rect: {
              x: 100,
              y: 120,
              width: 120,
              height: 40
            }
          })
        },
        edge: {
          ids: () => ['edge-1']
        },
      },
      projection: {
        selection: {
          move: () => ({
            nodes: [{
              id: 'node-1',
              type: 'text',
              position: {
                x: 100,
                y: 120
              },
              size: {
                width: 120,
                height: 40
              },
              rotation: 0,
              data: {
                text: 'node-1'
              }
            }],
            edges: [{
              id: 'edge-1',
              type: 'straight',
              source: {
                kind: 'point',
                point: { x: 80, y: 140 }
              },
              target: {
                kind: 'point',
                point: { x: 200, y: 140 }
              },
              route: {
                kind: 'auto'
              }
            }]
          })
        },
        frame: {
          pick: vi.fn(() => undefined),
          parent: vi.fn()
        },
        mindmaps: {
          tree: vi.fn(() => undefined)
        }
      },
      sessionRead: {
        tool: {
          is: () => false
        }
      },
      session: {
        commands: {
          selection: {
            replace: vi.fn()
          }
        }
      },
      snap: {
        node: {
          move: vi.fn()
        }
      },
      write: {
        canvas: {
          selection: {
            move: moveSelection
          }
        }
      },
    } as never, {
      start: {
        phase: 'down',
        pointerId: 1,
        button: 0,
        buttons: 1,
        detail: 1,
        client: { x: 110, y: 130 },
        screen: { x: 110, y: 130 },
        world: { x: 110, y: 130 },
        samples: [],
        modifiers: {
          alt: false,
          shift: false,
          ctrl: false,
          meta: false
        },
        pick: {
          kind: 'node',
          id: 'node-1',
          part: 'body'
        },
        editable: false,
        ignoreInput: false,
        ignoreSelection: false,
        ignoreContextMenu: false
      },
      target: {
        nodeIds: ['node-1'],
        edgeIds: ['edge-1']
      },
      visibility: {
        kind: 'none'
      }
    })

    expect(session).not.toBeNull()
    if (!session) {
      return
    }

    session.move?.({
      pointerId: 1,
      world: { x: 150, y: 160 },
      modifiers: {
        alt: false,
        shift: false,
        ctrl: false,
        meta: false
      }
    } as never)
    session.up?.()

    expect(moveSelection).toHaveBeenCalledTimes(1)
    expect(moveSelection).toHaveBeenCalledWith({
      nodeIds: ['node-1'],
      edgeIds: ['edge-1'],
      delta: {
        x: 40,
        y: 30
      }
    })
  })
})
