import { selection as selectionApi, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  CanvasItemRef,
  GroupId
} from '@whiteboard/core/types'
import type { EditorSceneApi } from '@whiteboard/editor/scene/api'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type {
  CanvasWrite,
  GroupWrite,
  NodeWrite,
  OrderMode
} from '@whiteboard/editor/write/types'
import type {
  SelectionActions,
  SelectionCommands
} from '@whiteboard/editor/action/types'

const DEFAULT_FRAME_PADDING = 32

export type SelectionActionHelpers = Pick<
  SelectionActions,
  'duplicate' | 'delete' | 'order' | 'group' | 'ungroup' | 'frame'
>

type SelectionActionHelpersHost = {
  read: Pick<EditorSceneApi, 'query'>
  canvas: CanvasWrite
  group: GroupWrite
  node: Pick<NodeWrite, 'create'>
  session: Pick<SelectionCommands, 'replace' | 'clear'>
  defaults: EditorDefaults['templates']
}

const orderRefs = (
  canvas: Pick<CanvasWrite, 'order'>,
  refs: CanvasItemRef[],
  mode: OrderMode
) => canvas.order.move(refs, mode)

const orderGroups = (
  group: Pick<GroupWrite, 'order'>,
  groupIds: readonly GroupId[],
  mode: OrderMode
) => group.order.move(groupIds, mode)

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

const createFrame = (
  node: Pick<NodeWrite, 'create'>,
  session: Pick<SelectionCommands, 'replace'>,
  defaults: EditorDefaults['templates'],
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
    template: defaults.frame({
      bounds,
      padding
    })
  })
  if (!result.ok) {
    return false
  }

  session.replace({
    nodeIds: [result.data.nodeId]
  })
  return true
}

const createSelectionActionHelpers = ({
  read,
  canvas,
  group,
  node,
  session,
  defaults
}: SelectionActionHelpersHost): SelectionActionHelpers => ({
  duplicate: (input, options) => {
    const target = selectionApi.target.normalize(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = canvas.duplicate(refs)
    if (!result.ok) {
      return false
    }

    if (options?.selectInserted !== false) {
      session.replace({
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
    const target = selectionApi.target.normalize(input)
    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    const result = canvas.delete(refs)
    if (!result.ok) {
      return false
    }

    if (options?.clearSelection !== false) {
      session.clear()
    }

    return true
  },
  order: (input, mode) => {
    const target = selectionApi.target.normalize(input)
    const groupIds = read.query.group.exact(target)
    if (groupIds.length > 0) {
      return orderGroups(group, groupIds, mode).ok
    }

    const refs = toCanvasRefs(target)
    if (!refs.length) {
      return false
    }

    return orderRefs(canvas, refs, mode).ok
  },
  group: (input, options) => {
    const target = selectionApi.target.normalize(input)
    const result = group.merge(target)
    if (!result.ok) {
      return false
    }

    if (options?.selectResult === false) {
      return true
    }

    session.replace(target)
    return true
  },
  ungroup: (input, options) => {
    const target = selectionApi.target.normalize(input)
    const groupIds = [...read.query.group.exact(target)]
    if (!groupIds.length) {
      return false
    }

    const result = group.ungroup(groupIds)
    if (!result.ok) {
      return false
    }

    if (options?.fallbackSelection === 'none') {
      session.clear()
      return true
    }

    session.replace({
      nodeIds: result.data.nodeIds,
      edgeIds: result.data.edgeIds
    })
    return true
  },
  frame: (bounds, options) => createFrame(
    node,
    session,
    defaults,
    bounds,
    options?.padding ?? DEFAULT_FRAME_PADDING
  )
})

export const createSelectionActions = (input: {
  document: Pick<import('@whiteboard/editor-scene').DocumentQuery, 'nodeIds' | 'edgeIds'>
  read: Pick<EditorSceneApi, 'query'>
  canvas: CanvasWrite
  group: GroupWrite
  node: Pick<NodeWrite, 'create'>
  session: SelectionCommands
  defaults: EditorDefaults['templates']
}): SelectionActions => {
  const helpers = createSelectionActionHelpers(input)

  return {
    replace: (target) => {
      input.session.replace(selectionApi.target.normalize(target))
    },
    add: (target) => {
      input.session.add(selectionApi.target.normalize(target))
    },
    remove: (target) => {
      input.session.remove(selectionApi.target.normalize(target))
    },
    toggle: (target) => {
      input.session.toggle(selectionApi.target.normalize(target))
    },
    selectAll: () => {
      input.session.replace({
        nodeIds: input.document.nodeIds(),
        edgeIds: input.document.edgeIds()
      })
    },
    clear: () => {
      input.session.clear()
    },
    ...helpers
  }
}
