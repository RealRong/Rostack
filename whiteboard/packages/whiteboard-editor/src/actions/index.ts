import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  AppActions,
  ClipboardActions,
  DrawActions,
  EditorActions,
  HistoryActions,
  HoverSessionActions,
  PreviewSessionActions,
  ToolActions,
  ViewportActions
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
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/schema/draw-mode'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'
import type { EditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults'
import type { Tool } from '@whiteboard/editor/schema/tool'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { NodeTypeSupport } from '@whiteboard/editor/node'
import type { EditorWrite } from '@whiteboard/editor/write'
import type { EditorHoverState } from '@whiteboard/editor/state/document'
import { EMPTY_HOVER_STATE } from '@whiteboard/editor/state/document'
import type { EditorStateStoreFacade } from '@whiteboard/editor/state/runtime'
import { EMPTY_PREVIEW_STATE } from '@whiteboard/editor/state/preview'
import type { EditorStateStores } from '@whiteboard/editor/scene-ui/state'

export type EditorActionContext = {
  document: DocumentFrame
  projection: EditorScene
  state: EditorStateStoreFacade
  stores: EditorStateStores
  viewport: EditorViewport
  tasks: EditorTaskRuntime
  write: EditorWrite
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['templates']
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
    case 'insert':
      return json.stableStringify(left.template) === json.stableStringify(
        right.type === left.type
          ? right.template
          : undefined
      )
    case 'draw':
      return right.type === 'draw' && left.mode === right.mode
    default:
      return true
  }
}

export const createEditorActionsApi = ({
  document,
  projection,
  state,
  stores,
  viewport,
  tasks,
  write,
  nodeType,
  defaults
}: EditorActionContext): EditorActions => {
  const setTool = (
    nextTool: Tool
  ) => {
    const currentTool = stores.tool.get()
    const toolChanged = !isSameTool(currentTool, nextTool)

    state.write(({
      writer
    }) => {
      if (toolChanged || nextTool.type === 'draw') {
        writer.edit.clear()
        writer.selection.clear()
      }

      if (toolChanged) {
        writer.tool.set(nextTool)
      }
    })
  }

  const readActiveDrawBrush = () => {
    const tool = stores.tool.get()
    return tool.type === 'draw' && hasDrawBrush(tool.mode)
      ? tool.mode
      : DEFAULT_DRAW_BRUSH
  }

  const context = {
    document,
    projection,
    state,
    stores,
    viewport,
    tasks,
    write,
    nodeType,
    defaults
  } satisfies EditorActionContext

  const selection = createSelectionActions(context)
  const edit = createEditController(context)
  const edge = createEdgeActions(context, edit)
  const mindmap = createMindmapActionApi(context, edit)
  const clipboard = createClipboardActions(context, selection)

  const sessionTool: ToolActions = {
    set: setTool,
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
  }

  const sessionDraw: DrawActions = {
    set: (drawState) => {
      state.write(({
        writer
      }) => {
        writer.draw.set(drawState)
      })
    },
    slot: (slot) => {
      state.write(({
        writer
      }) => {
        writer.draw.slot(readActiveDrawBrush(), slot)
      })
    },
    patch: (patch) => {
      state.write(({
        writer
      }) => {
        writer.draw.patch(patch)
      })
    }
  }

  const readHover = (): EditorHoverState => state.read().hover ?? EMPTY_HOVER_STATE
  const readPreview = (): PreviewInput => stores.preview.get() ?? EMPTY_PREVIEW_STATE

  const sessionHover: HoverSessionActions = {
    get: readHover,
    set: (hoverState) => {
      state.write(({
        writer
      }) => {
        writer.hover.set(hoverState)
      })
    },
    clear: () => {
      state.write(({
        writer
      }) => {
        writer.hover.clear()
      })
    },
    edgeGuide: {
      get: () => readPreview().edgeGuide,
      set: (value) => {
        state.write(({
          writer
        }) => {
          writer.preview.edgeGuide.set(value)
        })
      },
      clear: () => {
        state.write(({
          writer
        }) => {
          writer.preview.edgeGuide.clear()
        })
      }
    }
  }

  const sessionPreview: PreviewSessionActions = {
    get: readPreview,
    reset: () => {
      state.write(({
        writer
      }) => {
        writer.preview.reset()
      })
    },
    clear: () => {
      state.write(({
        writer
      }) => {
        writer.preview.reset()
      })
    }
  }

  return {
    app: {
      replace: (nextDocument) => write.document.replace(nextDocument)
    },
    viewport: {
      set: (nextViewport) => {
        viewport.set(nextViewport)
      },
      panBy: (delta) => {
        viewport.panBy(delta)
      },
      panScreenBy: (deltaScreen) => {
        viewport.panScreenBy(deltaScreen)
      },
      zoomTo: (zoom, anchor) => {
        viewport.zoomTo(zoom, anchor)
      },
      fit: (rect, options) => {
        viewport.fit(rect, options)
      },
      reset: () => {
        viewport.reset()
      },
      wheel: (input, wheelSensitivity = 1) => {
        viewport.wheel(
          input,
          wheelSensitivity
        )
      }
    } satisfies ViewportActions,
    session: {
      tool: sessionTool,
      draw: sessionDraw,
      selection,
      edit: edit.actions,
      hover: sessionHover,
      preview: sessionPreview
    },
    document: {
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
      } satisfies HistoryActions
    }
  } satisfies {
    app: AppActions
    viewport: ViewportActions
    session: EditorActions['session']
    document: EditorActions['document']
  }
}
