import { json } from '@shared/core'
import { resolveTextNodeBootstrapSize } from '@whiteboard/core/node/bootstrap'
import {
  applyScopedRecordWriteToPatch,
  splitScopedPatch
} from '@whiteboard/core/utils/scopedPatch'
import type {
  MindmapBranchField,
  MindmapId,
  MindmapInsertInput,
  MindmapRecord,
  MindmapTopicField,
  MindmapTopicUpdateInput,
  MindmapTree,
  Node,
  NodeId,
  Point,
  SpatialNodeInput
} from '@whiteboard/core/types'
import type { MindmapBranchUpdateInput } from '@whiteboard/core/types'

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(target, key)

export const createMindmapTopicPatch = (
  update: MindmapTopicUpdateInput
): import('@whiteboard/core/types').MindmapTopicPatch => applyScopedRecordWriteToPatch({
  ...(update.fields ? json.clone(update.fields) : {})
}, update.record, ['data', 'style'])

export const readMindmapTopicUpdateFromPatch = (
  patch: import('@whiteboard/core/types').MindmapTopicPatch
): MindmapTopicUpdateInput => {
  const {
    record
  } = splitScopedPatch(patch, ['data', 'style'])
  const fields: import('@whiteboard/core/types').MindmapTopicFieldPatch = {}

  if (hasOwn(patch, 'size')) {
    fields.size = json.clone(patch.size)
  }
  if (hasOwn(patch, 'rotation')) {
    fields.rotation = json.clone(patch.rotation)
  }
  if (hasOwn(patch, 'locked')) {
    fields.locked = json.clone(patch.locked)
  }

  return {
    ...(Object.keys(fields).length ? { fields } : {}),
    ...(record ? { record } : {})
  }
}

export const getNodeMindmapId = (
  node: Pick<Node, 'owner'> | undefined
): MindmapId | undefined => (
  node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
)

export const isMindmapRoot = (
  document: Pick<import('@whiteboard/core/types').Document, 'mindmaps'>,
  node: Node | undefined
): boolean => {
  const mindmapId = getNodeMindmapId(node)
  if (!mindmapId || !node) {
    return false
  }
  return document.mindmaps[mindmapId]?.root === node.id
}

const createTopicData = (
  payload?: import('@whiteboard/core/types').MindmapInsertPayload | { kind: string; [key: string]: unknown }
) => {
  if (!payload) {
    return {
      text: 'Topic'
    }
  }

  switch (payload.kind) {
    case 'text':
      return {
        text: typeof payload.text === 'string' ? payload.text : 'Topic'
      }
    case 'file':
      return {
        fileId: payload.fileId,
        name: payload.name
      }
    case 'link':
      return {
        url: payload.url,
        title: payload.title
      }
    case 'ref':
      return {
        ref: payload.ref,
        title: payload.title
      }
    default:
      return {
        ...payload
      }
  }
}

export const createMindmapTopicNode = (
  id: NodeId,
  mindmapId: MindmapId,
  input?: MindmapInsertInput
): SpatialNodeInput => ({
  id,
  type: input?.node?.type ?? 'text',
  owner: {
    kind: 'mindmap',
    id: mindmapId
  },
  position: { x: 0, y: 0 },
  size: input?.node?.size,
  rotation: input?.node?.rotation,
  locked: input?.node?.locked,
  data: {
    ...(input?.node?.data ?? {}),
    ...createTopicData(input?.payload)
  },
  style: input?.node?.style
})
