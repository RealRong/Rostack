import { describe, expect, it } from 'vitest'
import { store } from '@shared/core'
import { createEditorLayout } from '../src/layout/runtime'
import type { NodeRegistry } from '../src'

const registry: NodeRegistry = {
  get: (type) => {
    if (type === 'text') {
      return {
        type: 'text',
        meta: {
          name: 'Text',
          family: 'text',
          icon: 'text',
          controls: ['text', 'fill']
        },
        role: 'content',
        connect: true,
        resize: true,
        rotate: true,
        layout: {
          kind: 'size'
        },
        enter: true,
        edit: {
          fields: {
            text: {
              multiline: true,
              empty: 'keep'
            }
          }
        }
      }
    }

    if (type === 'mindmap') {
      return {
        type: 'mindmap',
        meta: {
          name: 'Mindmap',
          family: 'shape',
          icon: 'mindmap',
          controls: []
        },
        role: 'content',
        connect: false,
        resize: false,
        rotate: false
      }
    }

    return undefined
  }
}

describe('mindmap layout preview runtime', () => {
  it('applies root move preview to layout read', () => {
    const preview = store.createValueStore({
      rootMove: {
        treeId: 'mind-1',
        delta: {
          x: 60,
          y: 40
        }
      }
    })

    const layout = createEditorLayout({
      read: {
        node: {
          committed: {
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
                    position: { x: 0, y: 0 },
                    size: { width: 120, height: 40 },
                    data: {
                      text: 'Root'
                    }
                  },
                  rect: {
                    x: 0,
                    y: 0,
                    width: 120,
                    height: 40
                  }
                }
              }

              if (id === 'child-1') {
                return {
                  node: {
                    id: 'child-1',
                    type: 'text',
                    owner: {
                      kind: 'mindmap',
                      id: 'mind-1'
                    },
                    position: { x: 180, y: 0 },
                    size: { width: 120, height: 40 },
                    data: {
                      text: 'Child'
                    }
                  },
                  rect: {
                    x: 180,
                    y: 0,
                    width: 120,
                    height: 40
                  }
                }
              }

              return undefined
            },
            subscribe: () => () => {}
          }
        },
        mindmap: {
          list: store.createValueStore(['mind-1']),
          committed: {
            get: (id: string) => id === 'mind-1'
              ? {
                  id: 'mind-1',
                  rootId: 'root-1',
                  nodeIds: ['root-1', 'child-1'],
                  computed: {
                    node: {
                      'root-1': {
                        x: 0,
                        y: 0,
                        width: 120,
                        height: 40
                      },
                      'child-1': {
                        x: 180,
                        y: 0,
                        width: 120,
                        height: 40
                      }
                    },
                    bbox: {
                      x: 0,
                      y: 0,
                      width: 300,
                      height: 40
                    }
                  },
                  connectors: []
                }
              : undefined,
            subscribe: () => () => {}
          },
          structure: {
            get: (id: string) => id === 'mind-1'
              ? {
                  id: 'mind-1',
                  rootId: 'root-1',
                  nodeIds: ['root-1', 'child-1'],
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
                      },
                      'child-1': {
                        parentId: 'root-1',
                        side: 'right',
                        branch: {
                          color: '#111827',
                          line: 'curve',
                          width: 2,
                          stroke: 'solid'
                        }
                      }
                    },
                    children: {
                      'root-1': ['child-1'],
                      'child-1': []
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
                }
              : undefined,
            subscribe: () => () => {}
          }
        }
      } as any,
      session: {
        edit: store.createValueStore(null),
        mindmapPreview: preview
      },
      registry
    })

    expect(layout.mindmap.item.get('mind-1')?.computed.node['root-1']).toEqual({
      x: 60,
      y: 40,
      width: 120,
      height: 40
    })
    expect(layout.mindmap.item.get('mind-1')?.computed.node['child-1']).toEqual({
      x: 240,
      y: 40,
      width: 120,
      height: 40
    })
  })
})
