import { node as nodeApi } from '@whiteboard/core/node'
import type {
  AppActions,
  ClipboardActions,
  EditorActions,
  HistoryActions,
  ToolActions
} from '@whiteboard/editor/action/types'
import {
  createClipboardActions
} from '@whiteboard/editor/action/clipboard'
import {
  createEditController
} from '@whiteboard/editor/action/edit'
import {
  createEdgeActions
} from '@whiteboard/editor/action/edge'
import {
  createMindmapActionApi
} from '@whiteboard/editor/action/mindmap'
import {
  createSelectionActions
} from '@whiteboard/editor/action/selection'
import type { EditorSceneApi } from '@whiteboard/editor/scene/api'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ToolService } from '@whiteboard/editor/services/tool'
import type { EditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { EditorState } from '@whiteboard/editor/types/editor'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { NodeTypeSupport } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write'

export type CreateEditorActionsApiDeps = {
  document: DocumentFrame
  state: Pick<EditorState, 'viewport' | 'selection'>
  session: EditorSession
  graph: EditorSceneApi
  tasks: EditorTaskRuntime
  tool: ToolService
  write: EditorWrite
  nodeType: NodeTypeSupport
  defaults: EditorDefaults['templates']
}

export const createEditorActionsApi = ({
  document,
  state,
  session,
  graph,
  tasks,
  tool,
  write,
  nodeType,
  defaults
}: CreateEditorActionsApiDeps): EditorActions => {
  const selection = createSelectionActions({
    document,
    read: graph,
    canvas: write.canvas,
    group: write.group,
    node: write.node,
    session: session.commands.selection,
    defaults
  })
  const edit = createEditController({
    session,
    document,
    nodeType,
    write
  })
  const edge = createEdgeActions({
    graph,
    document,
    session,
    write,
    edit
  })
  const mindmap = createMindmapActionApi({
    graph,
    document,
    session,
    tasks,
    write,
    edit
  })
  const clipboard = createClipboardActions({
    editor: {
      documentSource: document,
      document: write.document,
      session: session.commands.selection,
      selection: {
        delete: selection.delete
      },
      state
    }
  })

  return {
    app: {
      replace: (nextDocument) => write.document.replace(nextDocument)
    },
    tool: {
      set: (nextTool) => tool.set(nextTool),
      select: () => tool.select(),
      draw: (mode) => tool.draw(mode),
      edge: (template) => tool.edge(template),
      insert: (template) => tool.insert(template),
      hand: () => tool.hand()
    },
    viewport: {
      set: (viewport) => session.viewport.commands.set(viewport),
      panBy: (delta) => session.viewport.commands.panBy(delta),
      zoomTo: (input) => session.viewport.commands.zoomTo(input),
      fit: (rect, options) => session.viewport.commands.fit(rect, options),
      reset: () => session.viewport.commands.reset(),
      setRect: (rect) => session.viewport.setRect(rect),
      setLimits: (limits) => session.viewport.setLimits(limits)
    },
    draw: {
      set: (nextState) => session.mutate.draw.set(nextState),
      slot: (slot) => session.mutate.draw.slot(slot),
      patch: (patch) => session.mutate.draw.patch(patch)
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
