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
    const rootRect = editor.read.node.item.get(result!.nodeId)?.rect
    expect(rootRect).toBeDefined()
    expect(rootRect!.x + rootRect!.width / 2).toBe(at.x)
    expect(rootRect!.y + rootRect!.height / 2).toBe(at.y)
  })
})
