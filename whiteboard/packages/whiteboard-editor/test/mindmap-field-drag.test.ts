import { describe, expect, it, vi } from 'vitest'
import { createMoveInteraction } from '../src/input/features/selection/move'

describe('mindmap field drag', () => {
  it('routes selected mindmap root field drags into mindmap drag instead of generic node drag', () => {
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

    const session = createMoveInteraction({
      document: {
        nodes: {
          get: (id: string) => {
            if (id === 'root-1') {
              return {
                node: {
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
                },
                rect: {
                  x: 100,
                  y: 120,
                  width: 144,
                  height: 44
                }
              }
            }

            if (id === 'mind-1') {
              return {
                node: {
                  id: 'mind-1',
                  type: 'text',
                  owner: {
                    kind: 'mindmap',
                    id: 'mind-1'
                  },
                  position: { x: 100, y: 120 },
                  data: {}
                },
                rect: {
                  x: 100,
                  y: 120,
                  width: 144,
                  height: 44
                }
              }
            }

            return undefined
          }
        },
        edges: {
          ids: vi.fn(() => [])
        },
      },
      projection: {
        query: {
          frame: {
            pick: vi.fn(() => undefined),
            parent: vi.fn()
          },
          mindmap: {
            resolve: vi.fn(() => 'mind-1'),
            structure: vi.fn(() => structure),
            get: () => ({
              structure: {
                nodeIds: ['root-1']
              },
              tree: {
                layout: {
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
              },
              render: {
                connectors: []
              }
            })
          }
        }
      },
      sessionRead: {
        tool: {
          is: () => true
        }
      },
      actions: {
        selection: {
          replace: vi.fn()
        }
      },
      write: {
        canvas: {
          selection: {
            move: vi.fn()
          }
        },
        mindmap: {
          move: vi.fn(),
          topic: {
            move: vi.fn()
          }
        }
      },
      snap: {
        node: {
          move: vi.fn()
        }
      },
      engine: {
        config: {
          nodeSize: {
            width: 120,
            height: 72
          }
        }
      } as never
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
