import { describe, expect, it } from 'vitest'
import { createDocument } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'
import { createEditor } from '@whiteboard/editor'
import type { NodeRegistry } from '@whiteboard/editor'
import { INSERT_PRESET_CATALOG } from '../src/features/toolbox/presets'
import { createInsertBridge } from '../src/runtime/bridge/insert'

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

describe('mindmap insert position', () => {
  it('centers the inserted blank mindmap on the requested point', () => {
    const editor = createEditor({
      engine: createEngine({
        document: createDocument('doc_mindmap_insert_position')
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
    const insert = createInsertBridge({
      editor,
      catalog: INSERT_PRESET_CATALOG
    })

    const at = {
      x: 480,
      y: 320
    }
    const result = insert.mindmap({
      at
    })

    expect(result).toBeDefined()
    const rootRect = editor.read.node.render.get(result!.nodeId)?.rect
    expect(rootRect).toBeDefined()
    expect(rootRect!.width).toBe(144)
    expect(rootRect!.height).toBe(44)
    expect(rootRect!.x + rootRect!.width / 2).toBe(at.x)
    expect(rootRect!.y + rootRect!.height / 2).toBe(at.y)
  })

  it('keeps the root anchor stable when the root width grows', () => {
    const editor = createEditor({
      engine: createEngine({
        document: createDocument('doc_mindmap_root_anchor')
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
      preset: 'mindmap.underline-split'
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    const beforeRoot = editor.read.node.render.get(created.data.rootId)?.rect
    expect(beforeRoot).toBeDefined()

    editor.actions.node.patch([created.data.rootId], {
      fields: {
        size: {
          width: 320,
          height: beforeRoot!.height
        }
      }
    })

    const afterRoot = editor.read.node.render.get(created.data.rootId)?.rect
    expect(afterRoot).toBeDefined()
    expect(afterRoot!.x).toBe(beforeRoot!.x)
    expect(afterRoot!.y).toBe(beforeRoot!.y)
    expect(afterRoot!.width).toBe(320)
  })
})
