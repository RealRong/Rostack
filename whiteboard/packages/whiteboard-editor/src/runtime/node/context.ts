import type { NodeId } from '@whiteboard/core/types'
import type { EditorRead } from '../../types/editor'
import type { PreviewCommands } from '../preview/types'
import type { SessionCommands } from '../session/types'
import type { NodePatchWriter } from './types'

export type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorRead['node']['item']['get']>
    live: (id: NodeId) => ReturnType<EditorRead['node']['item']['get']>
  }
  write: NodePatchWriter & {
    deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWriter['update']> | undefined
  }
  preview: Pick<PreviewCommands['node'], 'text'>
  edit: Pick<SessionCommands['edit'], 'clear'>
  selection: Pick<SessionCommands['selection'], 'clear'>
}

export const createNodeContext = ({
  engineRead,
  read,
  patch,
  preview,
  session,
  deleteCascade
}: {
  engineRead: EditorRead['node']['item']
  read: EditorRead
  patch: NodePatchWriter
  preview: Pick<PreviewCommands['node'], 'text'>
  session: Pick<SessionCommands, 'edit' | 'selection'>
  deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWriter['update']> | undefined
}): NodeContext => ({
  read: {
    committed: (id) => engineRead.get(id),
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
