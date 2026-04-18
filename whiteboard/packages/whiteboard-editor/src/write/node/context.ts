import type { NodeId } from '@whiteboard/core/types'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { NodePatchWrite } from '@whiteboard/editor/write/types'

export type NodeContext = {
  read: {
    committed: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
    live: (id: NodeId) => ReturnType<EditorQuery['node']['item']['get']>
  }
  write: NodePatchWrite & {
    deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWrite['update']> | undefined
  }
}

export const createNodeContext = ({
  read,
  patch,
  deleteCascade
}: {
  read: EditorQuery
  patch: NodePatchWrite
  deleteCascade: (ids: NodeId[]) => ReturnType<NodePatchWrite['update']> | undefined
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
