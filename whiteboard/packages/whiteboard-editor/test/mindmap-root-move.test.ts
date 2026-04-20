import { describe, expect, it, vi } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createLocalEngineHistory } from '@whiteboard/history'
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

describe('mindmap root move', () => {
  it('moves the root topic together with the tree container', () => {
    const engine = createEngine({
      document: createDocument('doc_mindmap_root_move')
    })
    const editor = createEditor({
      engine,
      history: createLocalEngineHistory(engine),
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
    const beforeTree = editor.read.mindmap.render.get(mindmapId)?.bbox
    const beforeRoot = editor.read.document.get().nodes[rootId]?.position

    expect(beforeTree).toBeDefined()
    expect(beforeRoot).toBeDefined()

    editor.actions.mindmap.moveRoot({
      nodeId: mindmapId,
      position: {
        x: beforeRoot!.x + 120,
        y: beforeRoot!.y + 80
      },
      origin: beforeRoot,
      threshold: 0
    })

    const afterTree = editor.read.mindmap.render.get(mindmapId)?.bbox
    const afterRoot = editor.read.document.get().nodes[rootId]?.position

    expect(afterTree).toBeDefined()
    expect(afterTree!.x - beforeTree!.x).toBe(120)
    expect(afterTree!.y - beforeTree!.y).toBe(80)
    expect(afterRoot).toEqual({
      x: beforeRoot!.x + 120,
      y: beforeRoot!.y + 80
    })
  })

  it('keeps root move preview on the interaction draft until commit', () => {
    const moveRoot = vi.fn()
    const moveTopic = vi.fn()

    const session = createMindmapDragSession({
      write: {
        mindmap: {
          root: {
            move: moveRoot
          },
          topic: {
            move: moveTopic
          }
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

    expect(moveRoot).toHaveBeenCalledWith('mindmap_1', { x: 100, y: 0 })
    expect(moveTopic).not.toHaveBeenCalled()
  })
})
