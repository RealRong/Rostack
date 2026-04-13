import { createFrameNodeInput } from '@whiteboard/core/node'
import {
  normalizeSelectionTarget,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type {
  CanvasItemRef,
  GroupId,
  NodeInput
} from '@whiteboard/core/types'
import type {
  EditorRead,
} from '../types/editor'
import type {
  OrderMode,
  SessionActions,
  SelectionApi
} from '../types/commands'
import type { DocumentCommands } from './document'
import type { NodeCommands } from './node/types'

const DEFAULT_FRAME_PADDING = 32

export type SelectionCommands = Pick<
  SelectionApi,
  'duplicate' | 'delete' | 'order' | 'group' | 'ungroup' | 'frame'
>

type SelectionCommandsHost = {
  read: Pick<EditorRead, 'group'>
  document: Pick<DocumentCommands, 'delete' | 'duplicate' | 'order' | 'group'>
  node: Pick<NodeCommands, 'create'>
  session: Pick<SessionActions, 'selection'>
}

const orderRefs = (
  document: Pick<DocumentCommands, 'order'>,
  refs: CanvasItemRef[],
  mode: OrderMode
) => document.order(refs, mode)

const orderGroups = (
  order: DocumentCommands['group']['order'],
  groupIds: readonly string[],
  mode: OrderMode
) => {
  const ids = [...groupIds]
  if (mode === 'front') {
    return order.bringToFront(ids)
  }
  if (mode === 'forward') {
    return order.bringForward(ids)
  }
  if (mode === 'backward') {
    return order.sendBackward(ids)
  }

  return order.sendToBack(ids)
}

const toCanvasRefs = (
  target: SelectionTarget
): CanvasItemRef[] => [
  ...target.nodeIds.map((id) => ({
    kind: 'node' as const,
    id
  })),
  ...target.edgeIds.map((id) => ({
    kind: 'edge' as const,
    id
  }))
]

const readGroupTarget = (
  read: Pick<EditorRead, 'group'>,
  groupId: GroupId
): SelectionTarget | undefined => read.group.target(groupId)

const createFrame = (
  node: Pick<NodeCommands, 'create'>,
  session: Pick<SessionActions, 'selection'>,
  bounds: {
    x: number
    y: number
    width: number
    height: number
  },
  padding: number
) => {
  const frame = createFrameNodeInput()
  const result = node.create({
    ...frame,
    position: {
      x: bounds.x - padding,
      y: bounds.y - padding
    },
    size: {
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2
    }
  } satisfies NodeInput)
  if (!result.ok) {
    return false
  }

  session.selection.replace({
    nodeIds: [result.data.nodeId]
  })
  return true
}

export const createSelectionCommands = ({
  read,
  document,
  node,
  session
}: SelectionCommandsHost): SelectionCommands => ({
  duplicate: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = document.duplicate(refs)
    if (!result.ok) {
      return false
    }

    if (options?.selectInserted !== false) {
      session.selection.replace({
        nodeIds: result.data.roots.nodeIds.length > 0
          ? result.data.roots.nodeIds
          : result.data.allNodeIds,
        edgeIds: result.data.roots.edgeIds.length > 0
          ? result.data.roots.edgeIds
          : result.data.allEdgeIds
      })
    }

    return true
  },
  delete: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = document.delete(refs)
    if (!result.ok) {
      return false
    }

    if (options?.clearSelection !== false) {
      session.selection.clear()
    }

    return true
  },
  order: (input, mode) => {
    const target = normalizeSelectionTarget(input)
    const groupIds = read.group.exactIds(target)
    if (groupIds.length > 0) {
      return orderGroups(document.group.order, groupIds, mode).ok
    }

    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    return orderRefs(document, refs, mode).ok
  },
  group: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const result = document.group.merge(target)
    if (!result.ok) {
      return false
    }

    if (options?.selectResult === false) {
      return true
    }

    const selection = readGroupTarget(read, result.data.groupId)
    session.selection.replace(selection ?? target)
    return true
  },
  ungroup: (input, options) => {
    const target = normalizeSelectionTarget(input)
    const groupIds = [...read.group.exactIds(target)]
    if (!groupIds.length) {
      return false
    }

    const result = groupIds.length === 1
      ? document.group.ungroup(groupIds[0]!)
      : document.group.ungroupMany(groupIds)
    if (!result.ok) {
      return false
    }

    if (options?.fallbackSelection === 'none') {
      session.selection.clear()
      return true
    }

    session.selection.replace({
      nodeIds: result.data.nodeIds,
      edgeIds: result.data.edgeIds
    })
    return true
  },
  frame: (bounds, options) => createFrame(
    node,
    session,
    bounds,
    options?.padding ?? DEFAULT_FRAME_PADDING
  )
})
