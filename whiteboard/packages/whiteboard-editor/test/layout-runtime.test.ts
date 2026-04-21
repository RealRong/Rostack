import { describe, expect, it, vi } from 'vitest'
import { store } from '@shared/core'
import type { Node } from '@whiteboard/core/types'
import { createEditorLayout } from '../src/layout/runtime'
import type { LayoutBackend, NodeRegistry } from '../src'

const createRegistry = (): NodeRegistry => ({
  get: (type) => {
    if (type === 'sticky') {
      return {
        type: 'sticky',
        meta: {
          name: 'Sticky',
          family: 'text',
          icon: 'sticky',
          controls: []
        },
        layout: {
          kind: 'fit'
        },
        role: 'content',
        resize: true,
        rotate: true,
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

    return undefined
  }
})

const createStickyNode = (): Node => ({
  id: 'sticky-1',
  type: 'sticky',
  position: {
    x: 0,
    y: 0
  },
  size: {
    width: 180,
    height: 140
  },
  rotation: 0,
  data: {
    text: 'sticky',
    fontMode: 'auto'
  },
  style: {
    fontSize: 28
  }
})

describe('createEditorLayout', () => {
  it('does not recompute sticky auto font size during rotate preview', () => {
    const measure = vi.fn<LayoutBackend['measure']>(() => ({
      kind: 'fit',
      fontSize: 18
    }))
    const node = createStickyNode()
    const runtime = createEditorLayout({
      read: {
        node: {
          committed: {
            get: () => ({
              node,
              rect: {
                x: 0,
                y: 0,
                width: 180,
                height: 140
              }
            })
          }
        },
        mindmap: {
          list: store.createValueStore([]),
          committed: {
            get: () => undefined
          }
        }
      } as any,
      session: {
        edit: store.createValueStore(undefined),
        mindmapPreview: store.createValueStore(undefined)
      },
      registry: createRegistry(),
      backend: {
        measure
      }
    })

    expect(runtime.resolvePreviewPatches([{
      id: node.id,
      rotation: 45
    }])).toEqual([{
      id: node.id,
      rotation: 45
    }])
    expect(measure).not.toHaveBeenCalled()
  })

  it('recomputes sticky auto font size when preview size changes', () => {
    const measure = vi.fn<LayoutBackend['measure']>(() => ({
      kind: 'fit',
      fontSize: 18
    }))
    const node = createStickyNode()
    const runtime = createEditorLayout({
      read: {
        node: {
          committed: {
            get: () => ({
              node,
              rect: {
                x: 0,
                y: 0,
                width: 180,
                height: 140
              }
            })
          }
        },
        mindmap: {
          list: store.createValueStore([]),
          committed: {
            get: () => undefined
          }
        }
      } as any,
      session: {
        edit: store.createValueStore(undefined),
        mindmapPreview: store.createValueStore(undefined)
      },
      registry: createRegistry(),
      backend: {
        measure
      }
    })

    expect(runtime.resolvePreviewPatches([{
      id: node.id,
      size: {
        width: 100,
        height: 140
      }
    }])).toEqual([{
      id: node.id,
      size: {
        width: 100,
        height: 140
      },
      fontSize: 18
    }])
    expect(measure).toHaveBeenCalledTimes(1)
  })
})
