import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  AppActions,
  ClipboardActions,
  EditorActions,
  HistoryActions,
  ToolActions
} from '@whiteboard/editor/actions/types'
import {
  createClipboardActions
} from '@whiteboard/editor/actions/clipboard'
import {
  createEditController
} from '@whiteboard/editor/actions/edit'
import {
  createEdgeActions
} from '@whiteboard/editor/actions/edge'
import {
  createMindmapActionApi
} from '@whiteboard/editor/actions/mindmap'
import {
  createSelectionActions
} from '@whiteboard/editor/actions/selection'
import type {
  EditorScene,
  PreviewInput
} from '@whiteboard/editor-scene'
import { json } from '@shared/core'
import type {
  EditorCommand,
  EditorDispatchInput
} from '@whiteboard/editor/state/intents'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/schema/draw-mode'
import {
  patchDrawStyle,
  setDrawSlot
} from '@whiteboard/editor/schema/draw-state'
import type { DrawState } from '@whiteboard/editor/schema/draw-state'
import type { EditSession } from '@whiteboard/editor/schema/edit'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'
import type { EditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults'
import type { Tool } from '@whiteboard/editor/schema/tool'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { NodeTypeSupport } from '@whiteboard/editor/node'
import type { EditorWrite } from '@whiteboard/editor/write'

export type CreateEditorActionsApiDeps = {
  document: DocumentFrame
  projection: EditorScene
  editor: {
    tool: {
      get: () => Tool
    }
    draw: {
      get: () => DrawState
    }
    edit: {
      get: () => EditSession | null
    }
    selection: {
      get: () => import('@whiteboard/core/selection').SelectionTarget
    }
    preview: {
      get: () => PreviewInput
    }
    state: Pick<import('@whiteboard/editor/api/editor').Editor['state'], 'write'>
    dispatch: (command: EditorDispatchInput) => void
    viewport: EditorViewport
  }
  tasks: EditorTaskRuntime
  write: EditorWrite
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['templates']
  onViewportFrameChange?: () => void
}

export const createEditorActionsApi = ({
  document,
  projection,
  editor,
  tasks,
  write,
  nodeType,
  defaults,
  onViewportFrameChange
}: CreateEditorActionsApiDeps): EditorActions => {
  const dispatchDraw = (
    state: DrawState
  ) => {
    editor.dispatch({
      type: 'draw.set',
      state
    } satisfies EditorCommand)
  }

  const readActiveDrawBrush = () => {
    const tool = editor.tool.get()
    return tool.type === 'draw' && hasDrawBrush(tool.mode)
      ? tool.mode
      : DEFAULT_DRAW_BRUSH
  }

  const stringifyToolPayload = (
    tool: Tool
  ) => {
    switch (tool.type) {
      case 'edge':
      case 'insert':
        return json.stableStringify(tool.template)
      case 'draw':
        return tool.mode
      default:
        return tool.type
    }
  }

  const isSameTool = (
    left: Tool,
    right: Tool
  ) => {
    if (left.type !== right.type) {
      return false
    }

    switch (left.type) {
      case 'edge':
        return right.type === 'edge'
          && stringifyToolPayload(left) === stringifyToolPayload(right)
      case 'insert':
        return right.type === 'insert'
          && stringifyToolPayload(left) === stringifyToolPayload(right)
      case 'draw':
        return right.type === 'draw' && left.mode === right.mode
      default:
        return true
    }
  }

  const setTool = (
    nextTool: Tool
  ) => {
    const currentTool = editor.tool.get()
    const toolChanged = !isSameTool(currentTool, nextTool)
    const commands: EditorCommand[] = []

    if (toolChanged || nextTool.type === 'draw') {
      commands.push(
        {
          type: 'edit.set',
          edit: null
        },
        {
          type: 'selection.set',
          selection: {
            nodeIds: [],
            edgeIds: []
          }
        }
      )
    }

    if (toolChanged) {
      commands.push({
        type: 'tool.set',
        tool: nextTool
      })
    }

    if (commands.length > 0) {
      editor.dispatch(commands)
    }
  }

  const selection = createSelectionActions({
    document,
    read: projection,
    canvas: write.canvas,
    group: write.group,
    node: write.node,
    selection: editor.selection,
    dispatch: editor.dispatch,
    defaults
  })
  const edit = createEditController({
    editor,
    document,
    nodeType,
    write
  })
  const edge = createEdgeActions({
    graph: projection,
    document,
    editor,
    write,
    edit
  })
  const mindmap = createMindmapActionApi({
    graph: projection,
    document,
    editor,
    tasks,
    write,
    edit
  })
  const clipboard = createClipboardActions({
    editor: {
      documentSource: document,
      document: write.document,
      dispatch: editor.dispatch,
      selection: {
        delete: selection.delete
      },
      selectionState: editor.selection,
      viewport: {
        get: editor.viewport.get
      }
    }
  })

  return {
    app: {
      replace: (nextDocument) => write.document.replace(nextDocument)
    },
    tool: {
      set: (nextTool) => setTool(nextTool),
      select: () => setTool({
        type: 'select'
      }),
      draw: (mode) => setTool({
        type: 'draw',
        mode
      }),
      edge: (template) => setTool({
        type: 'edge',
        template
      }),
      insert: (template) => setTool({
        type: 'insert',
        template
      }),
      hand: () => setTool({
        type: 'hand'
      })
    },
    viewport: {
      set: (viewport) => {
        editor.viewport.set(viewport)
      },
      panBy: (delta) => {
        editor.viewport.panBy(delta)
      },
      panScreenBy: (deltaScreen) => {
        editor.viewport.panScreenBy(deltaScreen)
      },
      zoomTo: (zoom, anchor) => {
        editor.viewport.zoomTo(zoom, anchor)
      },
      fit: (rect, options) => {
        editor.viewport.fit(rect, options)
      },
      reset: () => {
        editor.viewport.reset()
      },
      wheel: (input, wheelSensitivity = 1) => {
        editor.viewport.wheel(
          input,
          wheelSensitivity
        )
      }
    },
    draw: {
      set: (nextState) => {
        dispatchDraw(nextState)
      },
      slot: (slot) => {
        dispatchDraw(setDrawSlot(
          editor.draw.get(),
          readActiveDrawBrush(),
          slot
        ))
      },
      patch: (patch) => {
        const brush = readActiveDrawBrush()
        const currentSlot = editor.draw.get()[brush].slot
        dispatchDraw(patchDrawStyle(
          editor.draw.get(),
          brush,
          currentSlot,
          patch
        ))
      }
    },
    selection,
    edit: edit.actions,
    node: {
      create: (input) => write.node.create(input),
      patch: (ids, update, options) => {
        if (nodeApi.update.isEmpty(update)) {
          return undefined
        }

        const updates = ids.flatMap((id) => document.node(id)
          ? [{
              id,
              input: update
            }]
          : [])
        if (!updates.length) {
          return undefined
        }

        return write.node.updateMany(updates, {
          origin: options?.origin
        })
      },
      move: (input) => write.node.move(input),
      align: (ids, mode) => write.node.align(ids, mode),
      distribute: (ids, mode) => write.node.distribute(ids, mode),
      delete: (ids) => write.node.delete(ids),
      duplicate: (ids) => write.node.duplicate(ids),
      lock: {
        set: (nodeIds, locked) => write.node.lock.set(nodeIds, locked),
        toggle: (nodeIds) => write.node.lock.toggle(nodeIds)
      },
      shape: {
        set: (nodeIds, kind) => write.node.shape.set(nodeIds, kind)
      },
      style: {
        fill: (nodeIds, value) => write.node.style.fill(nodeIds, value),
        fillOpacity: (nodeIds, value) => write.node.style.fillOpacity(nodeIds, value),
        stroke: (nodeIds, value) => write.node.style.stroke(nodeIds, value),
        strokeWidth: (nodeIds, value) => write.node.style.strokeWidth(nodeIds, value),
        strokeOpacity: (nodeIds, value) => write.node.style.strokeOpacity(nodeIds, value),
        strokeDash: (nodeIds, value) => write.node.style.strokeDash(nodeIds, value),
        opacity: (nodeIds, value) => write.node.style.opacity(nodeIds, value),
        textColor: (nodeIds, value) => write.node.style.textColor(nodeIds, value)
      },
      text: {
        commit: (input) => write.node.text.commit(input),
        color: (nodeIds, color) => write.node.text.color(nodeIds, color),
        size: (input) => write.node.text.size(input),
        weight: (nodeIds, weight) => write.node.text.weight(nodeIds, weight),
        italic: (nodeIds, italic) => write.node.text.italic(nodeIds, italic),
        align: (nodeIds, align) => write.node.text.align(nodeIds, align)
      }
    },
    edge,
    mindmap,
    clipboard,
    history: {
      undo: () => write.history.undo(),
      redo: () => write.history.redo(),
      clear: () => {
        write.history.clear()
      }
    }
  } satisfies {
    app: AppActions
    tool: ToolActions
    clipboard: ClipboardActions
    history: HistoryActions
  } & EditorActions
}
