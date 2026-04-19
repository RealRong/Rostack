import {
  DEFAULT_ROOT_MOVE_THRESHOLD,
  resolveInsertPlan
} from '@whiteboard/core/mindmap'
import type {
  MindmapBranchPatch,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertInput,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  NodeId,
  NodeInput,
  NodeStyle
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { MindmapWrite } from '@whiteboard/editor/write/types'

const readMindmapIdForNodes = (
  read: Pick<EditorQuery, 'node'>,
  nodeIds: readonly NodeId[]
): MindmapId | undefined => {
  const ids = [...new Set(
    nodeIds.map((nodeId) => {
      const node = read.node.item.get(nodeId)?.node
      return node?.owner?.kind === 'mindmap'
        ? node.owner.id
        : undefined
    }).filter(Boolean)
  )]
  return ids.length === 1
    ? ids[0]
    : undefined
}

export const createMindmapWrite = ({
  engine,
  read,
  layout
}: {
  engine: Engine
  read: EditorQuery
  layout: EditorLayout
}): MindmapWrite => {
  const createTopicNodeSeed = (
    payload?: MindmapInsertInput['payload']
  ): NodeInput => {
    if (!payload) {
      return {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          text: 'Topic'
        }
      }
    }

    switch (payload.kind) {
      case 'text':
        return {
          type: 'text',
          position: { x: 0, y: 0 },
          data: {
            text: typeof payload.text === 'string' ? payload.text : 'Topic'
          }
        }
      case 'file':
        return {
          type: 'text',
          position: { x: 0, y: 0 },
          data: {
            fileId: payload.fileId,
            name: payload.name
          }
        }
      case 'link':
        return {
          type: 'text',
          position: { x: 0, y: 0 },
          data: {
            url: payload.url,
            title: payload.title
          }
        }
      case 'ref':
        return {
          type: 'text',
          position: { x: 0, y: 0 },
          data: {
            ref: payload.ref,
            title: payload.title
          }
        }
      default:
        return {
          type: 'text',
          position: { x: 0, y: 0 },
          data: {
            ...payload
          }
        }
    }
  }

  const patchInsertInput = (
    input: MindmapInsertInput
  ): MindmapInsertInput => {
    const patched = layout.patchNodeCreatePayload(
      createTopicNodeSeed(input.payload)
    )

    return {
      ...input,
      node: {
        type: patched.type === 'frame'
          ? undefined
          : patched.type,
        data: patched.data,
        style: patched.style,
        size: patched.size,
        rotation: patched.rotation,
        locked: patched.locked
      }
    }
  }

  return {
    create: (payload: MindmapCreateInput) => engine.execute({
      type: 'mindmap.create',
      input: {
        ...payload,
        template: layout.patchMindmapTemplate(
          payload.template,
          payload.position
        )
      }
    }),
    delete: (ids: MindmapId[]) => engine.execute({
      type: 'mindmap.delete',
      ids
    }),
    patch: (id, input) => engine.execute({
      type: 'mindmap.layout',
      id,
      patch: input.layout ?? {}
    }),
    insert: (id: MindmapId, input: MindmapInsertInput) => engine.execute({
      type: 'mindmap.topic.insert',
      id,
      input: patchInsertInput(input)
    }),
    moveSubtree: (id: MindmapId, input: MindmapMoveSubtreeInput) => engine.execute({
      type: 'mindmap.topic.move',
      id,
      input
    }),
    removeSubtree: (id: MindmapId, input: MindmapRemoveSubtreeInput) => engine.execute({
      type: 'mindmap.topic.delete',
      id,
      input
    }),
    cloneSubtree: (id, input) => engine.execute({
      type: 'mindmap.topic.clone',
      id,
      input
    }),
    insertByPlacement: (input) => {
      const plan = resolveInsertPlan({
        tree: input.tree,
        targetNodeId: input.targetNodeId,
        placement: input.placement,
        layoutSide: input.layout.side
      })
      if (plan.mode === 'towardRoot') {
        return undefined
      }

      return engine.execute({
        type: 'mindmap.topic.insert',
        id: input.id,
        input: patchInsertInput(
          plan.mode === 'child'
            ? {
                kind: 'child',
                parentId: plan.parentId,
                payload: input.payload,
                options: {
                  index: plan.index,
                  side: plan.side
                }
              }
            : {
                kind: 'sibling',
                nodeId: plan.nodeId,
                position: plan.position
              }
        )
      })
    },
    moveByDrop: (input) => engine.execute({
      type: 'mindmap.topic.move',
      id: input.id,
      input: {
        nodeId: input.nodeId,
        parentId: input.drop.parentId,
        index: input.drop.index,
        side: input.drop.side
      }
    }),
    moveRoot: (input) => {
      const node = read.node.item.get(input.nodeId)?.node
      const mindmapId = node?.owner?.kind === 'mindmap'
        ? node.owner.id
        : undefined
      if (!node || !mindmapId) {
        return undefined
      }
      const threshold = input.threshold ?? DEFAULT_ROOT_MOVE_THRESHOLD
      const delta = input.origin
        ? {
            x: input.position.x - input.origin.x,
            y: input.position.y - input.origin.y
          }
        : {
            x: input.position.x - node.position.x,
            y: input.position.y - node.position.y
          }
      if (Math.abs(delta.x) < threshold && Math.abs(delta.y) < threshold) {
        return undefined
      }
      return engine.execute({
        type: 'node.patch',
        updates: [{
          id: input.nodeId,
          update: {
            fields: {
              position: input.position
            }
          }
        }]
      })
    },
    style: {
      branch: (input) => {
        const scopeIds = input.scope === 'subtree' && input.id
          ? read.mindmap.item.get(input.id)?.childNodeIds ?? input.nodeIds
          : input.nodeIds
        return engine.execute({
          type: 'mindmap.branch.patch',
          id: input.id,
          topicIds: [...scopeIds],
          patch: input.patch as MindmapBranchPatch
        })
      },
      topic: (input) => {
        const mindmapId = readMindmapIdForNodes(read, input.nodeIds)
        if (!mindmapId) {
          return undefined
        }
        const style = Object.fromEntries(
          Object.entries({
            frameKind: input.patch.frameKind,
            stroke: input.patch.stroke,
            strokeWidth: input.patch.strokeWidth,
            fill: input.patch.fill
          }).filter(([, value]) => value !== undefined)
        ) as NodeStyle
        return engine.execute({
          type: 'mindmap.topic.patch',
          id: mindmapId,
          topicIds: [...input.nodeIds],
          patch: {
            style
          }
        })
      }
    }
  }
}
