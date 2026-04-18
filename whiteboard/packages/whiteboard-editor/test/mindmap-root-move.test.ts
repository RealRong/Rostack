import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { buildWhiteboardMindmapTemplate } from '@whiteboard/product'
import { createMindmapDragSession } from '../src/input/features/mindmap/drag'
import { createEditor } from '../src'
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
        canResize: true,
        canRotate: true,
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
        canResize: false,
        canRotate: false
      }
    }

    return undefined
  }
}

describe('mindmap root move', () => {
  it('moves the root topic together with the tree container', () => {
    const editor = createEditor({
      engine: createEngine({
        document: createDocument('doc_mindmap_root_move')
      }),
      initialTool: {
        type: 'select'
      },
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      },
      registry
    })

    const created = editor.actions.mindmap.create({
      template: buildWhiteboardMindmapTemplate({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const { mindmapId, rootId } = created.data
    const beforeTree = editor.read.document.get().nodes[mindmapId]?.position
    const beforeRoot = editor.read.document.get().nodes[rootId]?.position

    expect(beforeTree).toBeDefined()
    expect(beforeRoot).toBeDefined()

    editor.actions.mindmap.moveRoot({
      nodeId: mindmapId,
      position: {
        x: beforeTree!.x + 120,
        y: beforeTree!.y + 80
      },
      origin: beforeTree,
      threshold: 0
    })

    const afterTree = editor.read.document.get().nodes[mindmapId]?.position
    const afterRoot = editor.read.document.get().nodes[rootId]?.position

    expect(afterTree).toEqual({
      x: beforeTree!.x + 120,
      y: beforeTree!.y + 80
    })
    expect(afterRoot).toEqual({
      x: beforeRoot!.x + 120,
      y: beforeRoot!.y + 80
    })
  })

  it('keeps root move preview on the interaction draft until commit', () => {
    const moveRoot = vi.fn()

    const session = createMindmapDragSession({
      write: {
        mindmap: {
          moveRoot,
          moveByDrop: vi.fn()
        }
      },
      query: {
        mindmap: {
          item: {
            get: vi.fn()
          }
        },
        viewport: {
          pointer: vi.fn()
        }
      }
    } as any, {
      kind: 'root',
      treeId: 'mindmap_1',
      pointerId: 1,
      start: { x: 50, y: 0 },
      origin: { x: 50, y: 0 },
      position: { x: 100, y: 0 }
    })

    expect(session.gesture?.kind).toBe('mindmap-drag')
    expect(session.gesture?.draft.mindmap).toEqual({
      rootMove: {
        treeId: 'mindmap_1',
        delta: { x: 50, y: 0 }
      }
    })

    session.up?.()

    expect(moveRoot).toHaveBeenCalledWith({
      nodeId: 'mindmap_1',
      position: { x: 100, y: 0 },
      origin: { x: 50, y: 0 }
    })
  })
})
