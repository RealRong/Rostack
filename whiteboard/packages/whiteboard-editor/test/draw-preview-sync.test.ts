import { afterEach, describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { product } from '@whiteboard/product'
import { editor as editorApi, type LayoutBackend, type NodeSpec } from '../src'
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
  measure: () => ({
    kind: 'size',
    size: {
      width: 120,
      height: 40
    }
  })
}

const editors = new Set<{
  dispose(): void
}>()

const trackEditor = <T extends { dispose(): void }>(
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
    document: documentApi.create('doc_draw_preview_sync'),
    layout: layoutService
  })

  return trackEditor(editorApi.create({
    engine,
    history: engine.history,
    initialTool: {
      type: 'draw',
      mode: 'pen'
    },
    initialViewport: {
      center: {
        x: 0,
        y: 0
      },
      zoom: 1
    },
    nodes,
    services: {
      layout: layoutService
    }
  }))
}

describe('draw preview sync', () => {
  it('projects editor preview draw into scene chrome and notifies subscribers', () => {
    const editor = createEditor()
    let notified = 0
    const unsubscribe = editor.scene.ui.chrome.draw.preview.subscribe(() => {
      notified += 1
    })

    editor.state.write(({
      writer
    }) => {
      writer.preview.draw.set({
        kind: 'pen',
        style: {
          kind: 'pen',
          color: '#111111',
          width: 2,
          opacity: 1
        },
        points: [
          {
            x: 10,
            y: 10
          },
          {
            x: 40,
            y: 30
          }
        ],
        hiddenNodeIds: []
      })
    })

    expect(editor.state.read().preview.draw).not.toBeNull()
    expect(notified).toBe(1)
    expect(editor.scene.ui.chrome.draw.preview.get()).toMatchObject({
      kind: 'pen',
      points: [
        {
          x: 10,
          y: 10
        },
        {
          x: 40,
          y: 30
        }
      ]
    })
    unsubscribe()
  })

  it('notifies selection summary subscribers when selected node geometry changes', async () => {
    const editor = createEditor()
    const created = editor.actions.document.node.create({
      position: {
        x: 20,
        y: 16
      },
      template: {
        type: 'text',
        data: {
          text: 'Hello'
        }
      }
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    editor.actions.session.selection.replace({
      nodeIds: [created.data.nodeId]
    })

    const before = editor.scene.ui.selection.summary.get()
    let notified = 0
    const unsubscribe = editor.scene.ui.selection.summary.subscribe(() => {
      notified += 1
    })

    editor.actions.document.node.patch([created.data.nodeId], {
      fields: {
        position: {
          x: 140,
          y: 80
        }
      }
    })
    await Promise.resolve()

    const after = editor.scene.ui.selection.summary.get()
    expect(notified).toBe(1)
    expect(after.box).toBeDefined()
    expect(before.box).toBeDefined()
    expect(after.box?.x).not.toBe(before.box?.x)
    expect(after.box?.y).not.toBe(before.box?.y)
    unsubscribe()
  })

  it('notifies mindmap addChildTargets subscribers when root geometry changes', async () => {
    const editor = createEditor()
    const created = editor.actions.document.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    editor.actions.session.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const before = editor.scene.ui.mindmap.addChildTargets.get(created.data.mindmapId)
    let notified = 0
    const unsubscribe = editor.scene.ui.mindmap.addChildTargets.subscribe(
      created.data.mindmapId,
      () => {
        notified += 1
      }
    )

    editor.actions.document.node.patch([created.data.rootId], {
      fields: {
        position: {
          x: 160,
          y: 48
        }
      }
    })
    await Promise.resolve()

    const after = editor.scene.ui.mindmap.addChildTargets.get(created.data.mindmapId)
    expect(notified).toBe(1)
    expect(before?.addChildTargets).toHaveLength(2)
    expect(after?.addChildTargets).toHaveLength(2)
    expect(after?.addChildTargets[0]?.x).not.toBe(before?.addChildTargets[0]?.x)
    expect(after?.addChildTargets[0]?.y).not.toBe(before?.addChildTargets[0]?.y)
    unsubscribe()
  })
})
