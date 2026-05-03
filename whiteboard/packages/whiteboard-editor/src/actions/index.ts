import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EditorActions,
  HistoryActions
} from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'
import {
  createAppActions
} from '@whiteboard/editor/actions/app'
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
import {
  createSessionDrawActions
} from '@whiteboard/editor/actions/session-draw'
import {
  createSessionHoverActions
} from '@whiteboard/editor/actions/session-hover'
import {
  createSessionPreviewActions
} from '@whiteboard/editor/actions/session-preview'
import {
  createSessionToolActions
} from '@whiteboard/editor/actions/session-tool'
import {
  createViewportActions
} from '@whiteboard/editor/actions/viewport'

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

  return {
    app: createAppActions(context),
    viewport: createViewportActions(context),
    session: {
      tool: createSessionToolActions(context),
      draw: createSessionDrawActions(context),
      selection,
      edit: edit.actions,
      hover: createSessionHoverActions(context),
      preview: createSessionPreviewActions(context)
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
  } satisfies EditorActions
}
