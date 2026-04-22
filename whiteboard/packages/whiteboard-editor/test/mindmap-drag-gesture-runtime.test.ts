import { describe, expect, it } from 'vitest'
import { store } from '@shared/core'
import { document as documentApi } from '@whiteboard/core/document'
import { engine as engineApi } from '@whiteboard/engine'
import { history as historyApi } from '@whiteboard/history'
import { product } from '@whiteboard/product'
import { createEditorActions } from '../src/action'
import { createCommittedRead } from '../src/committed/read'
import { createEditorHost } from '../src/input/runtime'
import { createEditorLayout } from '../src/layout/runtime'
import { createEditorQuery } from '../src/query'
import { createEditorSession } from '../src/session/runtime'
import { DEFAULT_DRAW_STATE } from '../src/session/draw/state'
import { DEFAULT_EDITOR_DEFAULTS } from '../src/types/defaults'
import { createEditorWrite } from '../src/write'
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

describe('mindmap drag gesture runtime', () => {
  it('writes root drag gesture into interaction state and merged mindmap preview', () => {
    const engine = engineApi.create({
      document: documentApi.create('doc_mindmap_drag_gesture_runtime')
    })
    const history = historyApi.local.create(engine)
    const committed = createCommittedRead({
      engine
    })
    const session = createEditorSession({
      initialTool: {
        type: 'select'
      },
      initialDrawState: DEFAULT_DRAW_STATE,
      initialViewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      }
    })
    const mindmapPreview = store.createDerivedStore({
      get: () => store.read(session.preview.state).mindmap.preview,
      isEqual: (left, right) => left === right
    })
    const layout = createEditorLayout({
      read: {
        node: {
          committed: committed.node.committed
        },
        mindmap: {
          list: committed.mindmap.list,
          committed: committed.mindmap.layout,
          structure: committed.mindmap.structure
        }
      },
      session: {
        edit: session.state.edit,
        mindmapPreview
      },
      registry
    })
    const query = createEditorQuery({
      engineRead: committed,
      registry,
      history,
      layout,
      session,
      defaults: DEFAULT_EDITOR_DEFAULTS.selection
    })
    const write = createEditorWrite({
      engine,
      history,
      query,
      layout
    })
    const actions = createEditorActions({
      committed,
      session,
      query,
      layout,
      write,
      registry,
      defaults: DEFAULT_EDITOR_DEFAULTS.templates
    })
    const host = createEditorHost({
      engine,
      committed,
      session,
      query,
      layout,
      write,
      actions
    })

    const created = actions.mindmap.create({
      template: product.mindmap.template.build({
        preset: 'mindmap.underline-split'
      })
    })

    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    actions.selection.replace({
      nodeIds: [created.data.rootId]
    })

    const beforeRoot = query.node.render.get(created.data.rootId)?.rect
    expect(beforeRoot).toBeDefined()

    host.pointerDown(createPointerInput({
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
    host.pointerMove(createPointerInput({
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

    expect(session.interaction.read.gesture.get()?.draft.mindmap).toEqual({
      rootMove: {
        treeId: created.data.mindmapId,
        delta: {
          x: 60,
          y: 40
        }
      }
    })
    expect(mindmapPreview.get()).toEqual({
      rootMove: {
        treeId: created.data.mindmapId,
        delta: {
          x: 60,
          y: 40
        }
      }
    })
  })
})
