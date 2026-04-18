import type { NodeId } from '@whiteboard/core/types'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { NodePatchWriter } from '@whiteboard/editor/command/node/types'

export type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
    live: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
  }
  write: NodePatchWriter & {
    deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWriter['update']> | undefined
  }
}

export const createNodeContext = ({
  read,
  patch,
  deleteCascade
}: {
  read: EditorQuery
  patch: NodePatchWriter
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
  }
})
