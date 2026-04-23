import { edge as edgeApi } from '@whiteboard/core/edge'
import type { SelectionInput } from '@whiteboard/core/selection'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { DocumentRead } from '@whiteboard/editor/document/read'
import type { GraphRead } from '@whiteboard/editor/read/graph'
import type {
  EditCaret,
  EditField
} from '@whiteboard/editor/session/edit'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { ToolService } from '@whiteboard/editor/services/tool'
import type { Tool } from '@whiteboard/editor/types/tool'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import type { EditorWrite } from '@whiteboard/editor/write'

export type EditorInputOps = {
  selection: {
    replace: (input: SelectionInput) => void
    clear: () => void
  }
  edit: {
    startNode: (
      nodeId: NodeId,
      field: EditField,
      options?: {
        caret?: EditCaret
      }
    ) => void
    startEdgeLabel: (
      edgeId: EdgeId,
      labelId: string,
      options?: {
        caret?: EditCaret
      }
    ) => void
  }
  tool: {
    set: (tool: Tool) => void
  }
  edge: {
    route: {
      removePoint: (edgeId: EdgeId, index: number) => void
    }
  }
}

const applySelectionMutation = (
  session: Pick<EditorSession, 'mutate'>,
  apply: () => boolean
) => {
  if (!apply()) {
    return
  }

  session.mutate.edit.clear()
}

export const createEditorInputOps = ({
  document,
  graph,
  registry,
  session,
  tool: toolService,
  write
}: {
  document: Pick<DocumentRead, 'node' | 'edge'>
  graph: Pick<GraphRead, 'node' | 'edge'>
  registry: Pick<NodeRegistry, 'get'>
  session: Pick<EditorSession, 'mutate' | 'state'>
  tool: ToolService
  write: Pick<EditorWrite, 'edge'>
}): EditorInputOps => ({
  selection: {
    replace: (input) => {
      applySelectionMutation(session, () => session.mutate.selection.replace(input))
    },
    clear: () => {
      applySelectionMutation(session, () => session.mutate.selection.clear())
    }
  },
  edit: {
    startNode: (nodeId, field, options) => {
      const committed = document.node.committed.get(nodeId)
      if (!committed) {
        return
      }

      const capability = registry.get(committed.node.type)?.edit?.fields?.[field]
      if (!capability) {
        return
      }

      const text = typeof committed.node.data?.[field] === 'string'
        ? committed.node.data[field] as string
        : ''

      session.mutate.edit.set({
        kind: 'node',
        nodeId,
        field,
        text,
        composing: false,
        caret: options?.caret ?? { kind: 'end' }
      })
    },
    startEdgeLabel: (edgeId, labelId, options) => {
      const edge = document.edge.item.get(edgeId)?.edge
      const label = edge?.labels?.find((entry) => entry.id === labelId)
      if (!edge || !label) {
        return
      }

      const text = typeof label.text === 'string' ? label.text : ''

      session.mutate.edit.set({
        kind: 'edge-label',
        edgeId,
        labelId,
        text,
        composing: false,
        caret: options?.caret ?? { kind: 'end' }
      })
    }
  },
  tool: {
    set: (nextTool) => {
      toolService.set(nextTool)
    }
  },
  edge: {
    route: {
      removePoint: (edgeId, index) => {
        const edge = graph.edge.view.get(edgeId)?.base.edge
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }

        const patch = edgeApi.route.remove(edge, index)
        if (!patch) {
          throw new Error(`Edge route point ${edgeId}:${index} not found.`)
        }

        write.edge.route.set(edgeId, patch.route ?? {
          kind: 'auto'
        })
      }
    }
  }
})
