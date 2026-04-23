import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
import { product } from '@whiteboard/product'
import { editor as editorApi } from '../src'
import type { NodeRegistry, PointerInput } from '../src'

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
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_layout_preview_runtime')
    })
    const editor = editorApi.create({
      engine,
      history: historyApi.local.create(engine),
      initialTool: {
        type: 'select'
      },
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      },
      registry
    })

    try {
      const created = editor.actions.mindmap.create({
        template: product.mindmap.template.build({
          preset: 'mindmap.underline-split'
        })
      })

      expect(created.ok).toBe(true)
      if (!created.ok) {
        return
      }

      const inserted = editor.actions.mindmap.insertRelative({
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

      editor.actions.selection.replace({
        nodeIds: [created.data.rootId]
      })

      const beforeRoot = editor.read.node.view.get(created.data.rootId)?.rect
      const beforeChild = editor.read.node.view.get(inserted.data.nodeId)?.rect

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

      expect(editor.read.node.view.get(created.data.rootId)?.rect).toEqual({
        ...beforeRoot!,
        x: beforeRoot!.x + 60,
        y: beforeRoot!.y + 40
      })
      expect(editor.read.node.view.get(inserted.data.nodeId)?.rect).toEqual({
        ...beforeChild!,
        x: beforeChild!.x + 60,
        y: beforeChild!.y + 40
      })
    } finally {
      editor.dispose()
    }
  })
})
