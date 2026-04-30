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

describe('mindmap drag gesture runtime', () => {
  it('publishes live root drag geometry before commit', () => {
    const layoutService = createEditorTestLayout()
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_drag_gesture_runtime'),
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

      editor.write.selection.replace({
        nodeIds: [created.data.rootId]
      })

      const beforeRoot = editor.scene.query.scene.node(created.data.rootId)?.geometry.rect
      const beforeScene = editor.scene.query.scene.mindmap(created.data.mindmapId)?.tree.bbox

      expect(beforeRoot).toBeDefined()
      expect(beforeScene).toBeDefined()

      editor.input.pointerDown(createPointerInput({
        phase: 'down',
        x: beforeRoot!.x + 10,
        y: beforeRoot!.y + 10,
        pick: {
          kind: 'node',
          id: created.data.rootId,
          part: 'field',
          field: 'text'
        }
      }))
      editor.input.pointerMove(createPointerInput({
        phase: 'move',
        x: beforeRoot!.x + 70,
        y: beforeRoot!.y + 50,
        pick: {
          kind: 'node',
          id: created.data.rootId,
          part: 'field',
          field: 'text'
        }
      }))

      const liveRoot = editor.scene.query.scene.node(created.data.rootId)?.geometry.rect
      const liveScene = editor.scene.query.scene.mindmap(created.data.mindmapId)?.tree.bbox

      expect(liveRoot).toEqual({
        ...beforeRoot!,
        x: beforeRoot!.x + 60,
        y: beforeRoot!.y + 40
      })
      expect(liveScene).toEqual({
        ...beforeScene!,
        x: beforeScene!.x + 60,
        y: beforeScene!.y + 40
      })
    } finally {
      editor.dispose()
    }
  })
})
