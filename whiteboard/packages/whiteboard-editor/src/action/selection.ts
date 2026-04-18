import {
  normalizeSelectionTarget,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type {
  CanvasItemRef,
  GroupId
} from '@whiteboard/core/types'
import type { EditorQuery } from '@whiteboard/editor/query'
import type {
  OrderMode,
  DocumentWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import type { SelectionActions } from '@whiteboard/editor/action/types'
import type { SelectionSessionDeps } from '@whiteboard/editor/session/types'

const DEFAULT_FRAME_PADDING = 32

export type SelectionActionHelpers = Pick<
  SelectionActions,
  'duplicate' | 'delete' | 'order' | 'group' | 'ungroup' | 'frame'
>

type SelectionActionHelpersHost = {
  read: Pick<EditorQuery, 'group'>
  document: Pick<DocumentWrite, 'delete' | 'duplicate' | 'order' | 'group'>
  node: Pick<NodeWrite, 'create'>
  session: SelectionSessionDeps
}

const orderRefs = (
  document: Pick<DocumentWrite, 'order'>,
  refs: CanvasItemRef[],
  mode: OrderMode
) => document.order(refs, mode)

const orderGroups = (
  order: DocumentWrite['group']['order'],
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
  read: Pick<EditorQuery, 'group'>,
  groupId: GroupId
): SelectionTarget | undefined => read.group.target(groupId)

const createFrame = (
  node: Pick<NodeWrite, 'create'>,
  session: SelectionSessionDeps,
  bounds: {
    x: number
    y: number
    width: number
    height: number
  },
  padding: number
) => {
  const result = node.create({
    position: {
      x: bounds.x - padding,
      y: bounds.y - padding
    },
    template: {
      type: 'frame',
      size: {
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2
      },
      data: {
        title: 'Frame'
      },
      style: {
        fill: 'transparent',
        stroke: 'var(--wb-palette-border-4)',
        strokeWidth: 1,
        color: 'var(--wb-palette-text-4)'
      }
    }
  })
  if (!result.ok) {
    return false
  }

  session.replaceSelection({
    nodeIds: [result.data.nodeId]
  })
  return true
}

export const createSelectionActions = ({
  read,
  document,
  node,
  session
}: SelectionActionHelpersHost): SelectionActionHelpers => ({
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
      session.replaceSelection({
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
      session.clearSelection()
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
    session.replaceSelection(selection ?? target)
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
      session.clearSelection()
      return true
    }

    session.replaceSelection({
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
