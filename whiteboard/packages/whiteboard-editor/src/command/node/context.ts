import type { NodeId } from '@whiteboard/core/types'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type { LocalFeedbackActions } from '@whiteboard/editor/local/actions/feedback'
import type { SessionActions } from '@whiteboard/editor/types/commands'
import type { NodePatchWriter } from '@whiteboard/editor/command/node/types'
import type { TextLayoutMeasurer } from '@whiteboard/editor/types/textLayout'

export type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorQueryRead['node']['item']['get']>
    live: (id: NodeId) => ReturnType<EditorQueryRead['node']['item']['get']>
  }
  write: NodePatchWriter & {
    deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWriter['update']> | undefined
  }
  preview: Pick<LocalFeedbackActions['node'], 'text'>
  layout: {
    measureText?: TextLayoutMeasurer
  }
  edit: Pick<SessionActions['edit'], 'clear'>
  selection: Pick<SessionActions['selection'], 'clear'>
}

export const createNodeContext = ({
  read,
  patch,
  preview,
  measureText,
  session,
  deleteCascade
}: {
  read: EditorQueryRead
  patch: NodePatchWriter
  preview: Pick<LocalFeedbackActions['node'], 'text'>
  measureText?: TextLayoutMeasurer
  session: Pick<SessionActions, 'edit' | 'selection'>
  deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWriter['update']> | undefined
}): NodeContext => ({
  read: {
    committed: (id) => read.node.committed.get(id),
    live: (id) => read.node.item.get(id)
  },
  write: {
    update: patch.update,
    updateMany: patch.updateMany,
    deleteCascade
  },
  preview,
  layout: {
    measureText
  },
  edit: {
    clear: session.edit.clear
  },
  selection: {
    clear: session.selection.clear
  }
})
