import { describe, expect, it, vi } from 'vitest'
import { createMoveInteraction } from '../src/input/features/selection/move'

describe('mindmap field drag', () => {
  it('routes selected mindmap root field drags into mindmap drag instead of generic node drag', () => {
    const previewWriter = {
      mindmap: {
        create: vi.fn(),
        delete: vi.fn()
      }
    }
    const structure = {
      id: 'mind-1',
      rootId: 'root-1',
      nodeIds: ['root-1'],
      tree: {
        rootNodeId: 'root-1',
        nodes: {
          'root-1': {
            branch: {
              color: '#111827',
              line: 'curve',
              width: 2,
              stroke: 'solid'
            }
          }
        },
        children: {
          'root-1': []
        },
        layout: {
          side: 'both',
          mode: 'tidy',
          hGap: 28,
          vGap: 18
        }
      },
      layout: {
        side: 'both',
        mode: 'tidy',
        hGap: 28,
        vGap: 18
      }
    } as const

    const editor = {
      document: {
        snapshot: () => ({
          nodes: {
            'root-1': {
              id: 'root-1',
              type: 'text',
              owner: {
                kind: 'mindmap',
                id: 'mind-1'
              }
            }
          },
          mindmaps: {
            'mind-1': structure
          }
        }),
        node: (id: string) => {
          if (id === 'root-1') {
            return {
              id: 'root-1',
              type: 'text',
              owner: {
                kind: 'mindmap',
                id: 'mind-1'
              },
              position: { x: 100, y: 120 },
              size: { width: 144, height: 44 },
              data: {
                text: 'Central topic'
              }
            }
          }

          if (id === 'mind-1') {
            return {
              id: 'mind-1',
              type: 'text',
              owner: {
                kind: 'mindmap',
                id: 'mind-1'
              },
              position: { x: 100, y: 120 },
              data: {}
            }
          }

          return undefined
        }
      },
      scene: {
        frame: {
          pick: vi.fn(() => undefined),
          parent: vi.fn()
        },
        mindmaps: {
          tree: vi.fn(() => ({
            id: 'mind-1',
            rootId: 'root-1',
            nodeIds: ['root-1'],
            tree: {
              ...structure.tree,
              rootNodeId: 'root-1'
            },
            computed: {
              node: {
                'root-1': {
                  x: 100,
                  y: 120,
                  width: 144,
                  height: 44
                }
              },
              bbox: {
                x: 100,
                y: 120,
                width: 144,
                height: 44
              }
            }
          })),
          ofNodes: vi.fn(() => undefined)
        },
        ui: {
          state: {
            tool: {
              is: () => true
            }
          }
        }
      },
      state: {
        write: (
          apply: (input: {
            writer: {
              preview: typeof previewWriter
            }
            snapshot: {
              preview: {
                mindmap: Record<string, never>
              }
            }
          }) => void
        ) => {
          apply({
            writer: {
              preview: previewWriter
            },
            snapshot: {
              preview: {
                mindmap: {}
              }
            }
          })
        }
      },
      dispatch: vi.fn(),
      actions: {
        mindmap: {
          moveRoot: vi.fn(),
          moveByDrop: vi.fn()
        }
      },
      write: {
        canvas: {
          selection: {
            move: vi.fn()
          }
        }
      },
      runtime: {
        snap: {
          node: {
            move: vi.fn()
          }
        }
      }
    }

    const session = createMoveInteraction(editor as never, {
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
          id: 'root-1',
          part: 'field',
          field: 'text'
        },
        editable: false,
        ignoreInput: false,
        ignoreSelection: false,
        ignoreContextMenu: false
      },
      target: {
        nodeIds: ['root-1'],
        edgeIds: []
      },
      visibility: {
        kind: 'none'
      }
    })

    expect(session?.mode).toBe('mindmap-drag')
  })
})
