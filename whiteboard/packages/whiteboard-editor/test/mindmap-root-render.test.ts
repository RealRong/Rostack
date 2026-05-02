import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { editor as editorApi, type LayoutBackend, type NodeSpec } from '../src'
import { createNodeTypeSupport } from '../src/types/node'
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

const layout: LayoutBackend = {
  measure: (request) => {
    if (request.kind === 'fit') {
      return {
        kind: 'fit',
        fontSize: 14
      }
    }

    return {
      kind: 'size',
      size: {
        width: request.widthMode === 'wrap'
          ? (request.wrapWidth ?? request.minWidth ?? 144)
          : 132,
        height: 44
      }
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

const createEditor = () => {
  const layoutService = createEditorTestLayout(layout)
  const engine = engineApi.create({
    document: documentApi.create('doc_mindmap_root_render'),
    layout: layoutService
  })

  return trackEditor(editorApi.create({
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
}

describe('mindmap root render', () => {
  it('treats the root as a normal node and exposes both root add buttons through chrome', async () => {
    const editor = createEditor()
    const created = editor.actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    editor.actions.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const rootNode = editor.scene.nodes.get(created.data.rootId)?.base.node
    const nodeType = createNodeTypeSupport(nodes)
    const rootCapability = rootNode
      ? nodeType.support(rootNode)
      : undefined
    expect(rootCapability?.connect).toBe(true)
    expect(rootCapability?.resize).toBe(false)
    expect(rootCapability?.rotate).toBe(false)

    const chrome = editor.scene.ui.mindmap.addChildTargets.get(created.data.mindmapId)
    expect(chrome?.addChildTargets.map((entry) => entry.placement)).toEqual([
      'left',
      'right'
    ])
  })
})
