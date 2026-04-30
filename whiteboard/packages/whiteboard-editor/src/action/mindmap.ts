import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  MindmapId,
  MindmapNodeId,
  NodeId
} from '@whiteboard/core/types'
import type { EditController } from '@whiteboard/editor/action/edit'
import type { MindmapActions } from '@whiteboard/editor/action/types'
import { createMindmapActions as createMindmapWorkflowActions } from '@whiteboard/editor/tasks/mindmap'
import type { EditorSceneApi } from '@whiteboard/editor/scene/api'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { EditorTaskRuntime } from '@whiteboard/editor/tasks/runtime'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { EditorWrite } from '@whiteboard/editor/write'

const readMindmapRootMove = (input: {
  graph: Pick<EditorSceneApi, 'read'>
  document: Pick<DocumentFrame, 'node'>
  nodeId: NodeId
}) => {
  const directNode = input.graph.read.scene.nodes.get(input.nodeId)
  const structure = input.graph.read.scene.mindmaps.structure(input.nodeId)
  const rootView = directNode
    ? directNode
    : (
      structure
        ? input.graph.read.scene.nodes.get(structure.rootId)
        : undefined
    )
  const node = directNode?.base.node ?? (
    structure
      ? input.document.node(structure.rootId)
      : undefined
  )
  const mindmapId = directNode?.base.owner?.kind === 'mindmap'
    ? directNode.base.owner.id
    : input.graph.read.scene.mindmaps.id(input.nodeId)

  return {
    node,
    rootView,
    structure,
    mindmapId
  }
}

const readBranchScopeIds = (input: {
  graph: Pick<EditorSceneApi, 'read'>
  id: MindmapId
  nodeIds: readonly MindmapNodeId[]
  scope?: 'node' | 'subtree'
}) => input.scope === 'subtree'
  ? (input.graph.read.scene.mindmaps.structure(input.id)?.nodeIds ?? input.nodeIds)
  : input.nodeIds

export const createMindmapActionApi = (input: {
  graph: Pick<EditorSceneApi, 'read'>
  document: Pick<DocumentFrame, 'node'>
  session: Pick<EditorSession, 'preview'>
  tasks: EditorTaskRuntime
  write: Pick<EditorWrite, 'mindmap'>
  edit: Pick<EditController, 'focusMindmapNode' | 'focusMindmapRoot'>
}): MindmapActions => {
  const workflow = createMindmapWorkflowActions({
    graph: input.graph,
    session: input.session,
    tasks: input.tasks,
    write: input.write,
    focusNode: input.edit.focusMindmapNode,
    focusRoot: input.edit.focusMindmapRoot
  })

  return {
    create: workflow.create,
    delete: (ids) => input.write.mindmap.delete(ids),
    patch: (id, value) => input.write.mindmap.layout.set(id, value.layout ?? {}),
    insert: workflow.insert,
    moveSubtree: (id, value) => input.write.mindmap.topic.move(id, value),
    removeSubtree: (id, value) => input.write.mindmap.topic.delete(id, value),
    cloneSubtree: (id, value) => input.write.mindmap.topic.clone(id, value),
    insertRelative: workflow.insertRelative,
    moveByDrop: (value) => input.write.mindmap.topic.move(value.id, {
      nodeId: value.nodeId,
      parentId: value.drop.parentId,
      index: value.drop.index,
      side: value.drop.side
    }),
    moveRoot: (value) => {
      const resolved = readMindmapRootMove({
        graph: input.graph,
        document: input.document,
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

      return input.write.mindmap.move(resolved.mindmapId, value.position)
    },
    style: {
      branch: (value) => input.write.mindmap.branch.update(
        value.id,
        [...readBranchScopeIds({
          graph: input.graph,
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
        const mindmapId = input.graph.read.scene.mindmaps.ofNodes(value.nodeIds)
        if (!mindmapId) {
          return undefined
        }

        const style = mindmapApi.topicStyle.toNodeStylePatch(value.patch)
        return input.write.mindmap.topic.update(
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
