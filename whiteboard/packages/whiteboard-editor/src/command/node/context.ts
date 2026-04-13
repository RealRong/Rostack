import type { NodeId } from '@whiteboard/core/types'
import type { EditorQueryRead } from '../../query'
import type { LocalFeedbackActions } from '../../local/actions/feedback'
import type { SessionActions } from '../../types/commands'
import type { NodePatchWriter } from './types'

export type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorQueryRead['node']['item']['get']>
    live: (id: NodeId) => ReturnType<EditorQueryRead['node']['item']['get']>
  }
  write: NodePatchWriter & {
    deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWriter['update']> | undefined
  }
  preview: Pick<LocalFeedbackActions['node'], 'text'>
  edit: Pick<SessionActions['edit'], 'clear'>
  selection: Pick<SessionActions['selection'], 'clear'>
}

export const createNodeContext = ({
  read,
  patch,
  preview,
  session,
  deleteCascade
}: {
  read: EditorQueryRead
  patch: NodePatchWriter
  preview: Pick<LocalFeedbackActions['node'], 'text'>
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
  edit: {
    clear: session.edit.clear
  },
  selection: {
    clear: session.selection.clear
  }
})
