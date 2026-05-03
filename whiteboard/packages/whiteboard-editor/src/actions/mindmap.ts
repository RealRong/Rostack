import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapId,
  MindmapNodeId,
  NodeId
} from '@whiteboard/core/types'
import type { EditorActionContext } from '@whiteboard/editor/actions'
import type { EditController } from '@whiteboard/editor/actions/edit'
import type { MindmapActions } from '@whiteboard/editor/actions/types'
import { createMindmapActions as createMindmapWorkflowActions } from '@whiteboard/editor/tasks/mindmap'

const readMindmapRootMove = (input: {
  context: EditorActionContext
  nodeId: NodeId
}) => {
  const directNode = input.context.projection.nodes.get(input.nodeId)
  const tree = input.context.projection.mindmaps.tree(input.nodeId)
  const rootView = directNode
    ? directNode
    : (
      tree
        ? input.context.projection.nodes.get(tree.rootId)
        : undefined
    )
  const node = directNode?.base.node ?? (
    tree
      ? input.context.document.node(tree.rootId)
      : undefined
  )
  const mindmapId = directNode?.base.owner?.kind === 'mindmap'
    ? directNode.base.owner.id
    : tree?.id

  return {
    node,
    rootView,
    mindmapId
  }
}

const readBranchScopeIds = (input: {
  context: EditorActionContext
  id: MindmapId
  nodeIds: readonly MindmapNodeId[]
  scope?: 'node' | 'subtree'
}) => {
  if (input.scope !== 'subtree') {
    return input.nodeIds
  }

  return (
    input.context.projection.mindmaps.tree(input.id)?.nodeIds as
      | readonly MindmapNodeId[]
      | undefined
  ) ?? input.nodeIds
}

export const createMindmapActionApi = (
  context: EditorActionContext,
  edit: EditController
): MindmapActions => {
  const workflow = createMindmapWorkflowActions({
    context,
    focusNode: edit.focusMindmapNode,
    focusRoot: edit.focusMindmapRoot
  })

  return {
    create: workflow.create,
    delete: (ids) => context.write.mindmap.delete(ids),
    patch: (id, value) => context.write.mindmap.layout.set(id, value.layout ?? {}),
    insert: workflow.insert,
    moveSubtree: (id, value) => context.write.mindmap.topic.move(id, value),
    removeSubtree: (id, value) => context.write.mindmap.topic.delete(id, value),
    cloneSubtree: (id, value) => context.write.mindmap.topic.clone(id, value),
    insertRelative: workflow.insertRelative,
    moveByDrop: (value) => context.write.mindmap.topic.move(value.id, {
      nodeId: value.nodeId,
      parentId: value.drop.parentId,
      index: value.drop.index,
      side: value.drop.side
    }),
    moveRoot: (value) => {
      const resolved = readMindmapRootMove({
        context,
        nodeId: value.nodeId
      })
      if (!resolved.node || !resolved.mindmapId) {
        return undefined
      }

      const threshold = value.threshold ?? mindmapApi.plan.defaultRootMoveThreshold
      const delta = value.origin
        ? {
            x: value.position.x - value.origin.x,
            y: value.position.y - value.origin.y
          }
        : {
            x: value.position.x - (resolved.rootView?.geometry.rect.x ?? value.position.x),
            y: value.position.y - (resolved.rootView?.geometry.rect.y ?? value.position.y)
          }
      if (Math.abs(delta.x) < threshold && Math.abs(delta.y) < threshold) {
        return undefined
      }

      return context.write.mindmap.move(resolved.mindmapId, value.position)
    },
    style: {
      branch: (value) => context.write.mindmap.branch.update(
        value.id,
        [...readBranchScopeIds({
          context,
          id: value.id,
          nodeIds: value.nodeIds,
          scope: value.scope
        })].map((topicId) => ({
          topicId,
          input: {
            fields: {
              ...value.patch
            }
          }
        }))
      ),
      topic: (value) => {
        const mindmapId = context.projection.mindmaps.ofNodes(value.nodeIds)
        if (!mindmapId) {
          return undefined
        }

        const style = mindmapApi.topicStyle.toNodeStylePatch(value.patch)
        return context.write.mindmap.topic.update(
          mindmapId,
          value.nodeIds.map((topicId) => ({
            topicId,
            input: {
              record: {
                style
              }
            }
          }))
        )
      }
    }
  }
}
