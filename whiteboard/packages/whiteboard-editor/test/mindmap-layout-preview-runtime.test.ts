import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { NodeSpec, PointerInput } from '../src'
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

const createPointerInput = (
  input: {
    phase: PointerInput['phase']
    x: number
    y: number
    pick: PointerInput['pick']
  }
): PointerInput => ({
  phase: input.phase,
  pointerId: 1,
  button: 0,
  buttons: input.phase === 'up' ? 0 : 1,
  detail: 1,
  client: { x: input.x, y: input.y },
  screen: { x: input.x, y: input.y },
  world: { x: input.x, y: input.y },
  samples: [],
  modifiers: {
    alt: false,
    shift: false,
    ctrl: false,
    meta: false
  },
  pick: input.pick,
  editable: false,
  ignoreInput: false,
  ignoreSelection: false,
  ignoreContextMenu: false
})

describe('mindmap layout preview runtime', () => {
  it('moves the whole live tree during root drag preview', () => {
    const layoutService = createEditorTestLayout()
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_layout_preview_runtime'),
      layout: layoutService
    })
    const editor = editorApi.create({
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
    })

    try {
      const created = editor.write.mindmap.create({
        template: product.mindmap.template.build({
          preset: 'mindmap.underline-split'
        })
      })

      expect(created.ok).toBe(true)
      if (!created.ok) {
        return
      }

      const inserted = editor.write.mindmap.insertRelative({
        id: created.data.mindmapId,
        targetNodeId: created.data.rootId,
        relation: 'child',
        side: 'right',
        payload: {
          kind: 'text',
          text: 'Child'
        }
      })

      expect(inserted.ok).toBe(true)
      if (!inserted.ok) {
        return
      }

      editor.write.selection.replace({
        nodeIds: [created.data.rootId]
      })

      const beforeRoot = editor.scene.query.scene.node(created.data.rootId)?.geometry.rect
      const beforeChild = editor.scene.query.scene.node(inserted.data.nodeId)?.geometry.rect

      expect(beforeRoot).toBeDefined()
      expect(beforeChild).toBeDefined()

      editor.input.pointerDown(createPointerInput({
        phase: 'down',
        x: beforeRoot!.x + 8,
        y: beforeRoot!.y + 8,
        pick: {
          kind: 'node',
          id: created.data.rootId,
          part: 'field',
          field: 'text'
        }
      }))
      editor.input.pointerMove(createPointerInput({
        phase: 'move',
        x: beforeRoot!.x + 68,
        y: beforeRoot!.y + 48,
        pick: {
          kind: 'node',
          id: created.data.rootId,
          part: 'field',
          field: 'text'
        }
      }))

      expect(editor.scene.query.scene.node(created.data.rootId)?.geometry.rect).toEqual({
        ...beforeRoot!,
        x: beforeRoot!.x + 60,
        y: beforeRoot!.y + 40
      })
      expect(editor.scene.query.scene.node(inserted.data.nodeId)?.geometry.rect).toEqual({
        ...beforeChild!,
        x: beforeChild!.x + 60,
        y: beforeChild!.y + 40
      })
    } finally {
      editor.dispose()
    }
  })
})
