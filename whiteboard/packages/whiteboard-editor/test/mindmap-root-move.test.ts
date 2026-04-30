import { afterEach, describe, expect, it, vi } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { createMindmapDragSession } from '../src/input/features/mindmap/drag'
import { editor as editorApi } from '../src'
import type { NodeSpec } from '../src'
import { createEditorTestLayout } from './support'

const nodes: NodeSpec = {
  text: {
    meta: {
      type: 'text',
      name: 'Text',
      family: 'text',
      icon: 'text',
      controls: ['text', 'fill']
    },
    behavior: {
      role: 'content',
      connect: true,
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
  },
  mindmap: {
    meta: {
      type: 'mindmap',
      name: 'Mindmap',
      family: 'shape',
      icon: 'mindmap',
      controls: []
    },
    behavior: {
      role: 'content',
      connect: false,
      resize: false,
      rotate: false
    }
  }
}

const editors = new Set<{
  dispose: () => void
}>()

const trackEditor = <T extends { dispose: () => void }>(
  editor: T
): T => {
  editors.add(editor)
  return editor
}

afterEach(() => {
  editors.forEach((editor) => {
    editor.dispose()
  })
  editors.clear()
})

describe('mindmap root move', () => {
  it('moves the root topic together with the tree container', () => {
    const layoutService = createEditorTestLayout()
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_root_move'),
      layout: layoutService
    })
    const editor = trackEditor(editorApi.create({
      engine,
      history: engine.history,
      initialTool: {
        type: 'select'
      },
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      },
      nodes,
      services: {
        layout: layoutService
      }
    }))

    const created = editor.write.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const { mindmapId, rootId } = created.data
    const beforeTree = editor.scene.query.scene.mindmap(mindmapId)?.tree.bbox
    const beforeRoot = editor.document.snapshot().nodes[rootId]?.position

    expect(beforeTree).toBeDefined()
    expect(beforeRoot).toBeDefined()

    editor.write.mindmap.moveRoot({
      nodeId: mindmapId,
      position: {
        x: beforeRoot!.x + 120,
        y: beforeRoot!.y + 80
      },
      origin: beforeRoot,
      threshold: 0
    })

    const afterTree = editor.scene.query.scene.mindmap(mindmapId)?.tree.bbox
    const afterRoot = editor.document.snapshot().nodes[rootId]?.position

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
          move: moveRoot,
          topic: {
            move: moveTopic
          }
        }
      },
      query: {
        mindmap: {
          structure: {
            get: vi.fn()
          },
          layout: {
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
