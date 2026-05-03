import { selection as selectionApi, type SelectionInput, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  CanvasOrderAnchor,
  CanvasItemRef,
  GroupId
} from '@whiteboard/core/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'
import type {
  CanvasWrite,
  GroupWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import type {
  SelectionActions
} from '@whiteboard/editor/actions/types'

const DEFAULT_FRAME_PADDING = 32

const replaceSelection = (
  context: EditorActionContext,
  selection: SelectionTarget
) => {
  context.state.write(({
    writer
  }) => {
    writer.selection.set(selection)
  })
}

const orderRefs = (
  order: CanvasWrite['order'],
  refs: CanvasItemRef[],
  mode: 'front' | 'back' | 'forward' | 'backward'
) => mode === 'forward' || mode === 'backward'
  ? order.step(refs, mode)
  : order.move(refs, {
      kind: mode
    } satisfies CanvasOrderAnchor)

const orderGroups = (
  group: Pick<GroupWrite, 'order'>,
  groupIds: readonly GroupId[],
  mode: 'front' | 'back' | 'forward' | 'backward'
) => mode === 'forward' || mode === 'backward'
  ? group.order.step(groupIds, mode)
  : group.order.move(groupIds, {
      kind: mode
    } satisfies CanvasOrderAnchor)

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
  context: EditorActionContext,
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
    template: context.defaults.frame({
      bounds,
      padding
    })
  })
  if (!result.ok) {
    return false
  }

  replaceSelection(context, {
    nodeIds: [result.data.nodeId],
    edgeIds: []
  })
  return true
}

export const createSelectionActions = (context: EditorActionContext): SelectionActions => {
  const applySelection = (
    mode: 'replace' | 'add' | 'subtract' | 'toggle',
    target: SelectionInput
  ) => {
    const selection = mode === 'replace'
      ? selectionApi.target.normalize(target)
      : selectionApi.target.apply(
          context.stores.selection.get(),
          selectionApi.target.normalize(target),
          mode
        )

    replaceSelection(context, selection)
  }

  return {
    replace: (target) => {
      applySelection('replace', target)
    },
    add: (target) => {
      applySelection('add', target)
    },
    remove: (target) => {
      applySelection('subtract', target)
    },
    toggle: (target) => {
      applySelection('toggle', target)
    },
    selectAll: () => {
      applySelection('replace', {
        nodeIds: context.document.nodeIds(),
        edgeIds: context.document.edgeIds()
      })
    },
    clear: () => {
      applySelection('replace', {
        nodeIds: [],
        edgeIds: []
      })
    },
    duplicate: (value, options) => {
      const target = selectionApi.target.normalize(value)
      const refs = toCanvasRefs(target)
      if (!refs.length) {
        return false
      }

      const result = context.write.canvas.duplicate(refs)
      if (!result.ok) {
        return false
      }

      if (options?.selectInserted !== false) {
        replaceSelection(context, {
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
    delete: (value, options) => {
      const target = selectionApi.target.normalize(value)
      const refs = toCanvasRefs(target)
      if (!refs.length) {
        return false
      }

      const result = context.write.canvas.delete(refs)
      if (!result.ok) {
        return false
      }

      if (options?.clearSelection !== false) {
        replaceSelection(context, {
          nodeIds: [],
          edgeIds: []
        })
      }

      return true
    },
    order: (value, mode) => {
      const target = selectionApi.target.normalize(value)
      const groupIds = context.projection.groups.exact(target)
      if (groupIds.length > 0) {
        return orderGroups(context.write.group, groupIds, mode).ok
      }

      const refs = toCanvasRefs(target)
      if (!refs.length) {
        return false
      }

      const { order } = context.write.canvas
      return orderRefs(order, refs, mode).ok
    },
    group: (value, options) => {
      const target = selectionApi.target.normalize(value)
      const result = context.write.group.merge(target)
      if (!result.ok) {
        return false
      }

      if (options?.selectResult === false) {
        return true
      }

      replaceSelection(context, target)
      return true
    },
    ungroup: (value, options) => {
      const target = selectionApi.target.normalize(value)
      const groupIds = [...context.projection.groups.exact(target)]
      if (!groupIds.length) {
        return false
      }

      const result = context.write.group.ungroup(groupIds)
      if (!result.ok) {
        return false
      }

      if (options?.fallbackSelection === 'none') {
        replaceSelection(context, {
          nodeIds: [],
          edgeIds: []
        })
        return true
      }

      replaceSelection(context, {
        nodeIds: result.data.nodeIds,
        edgeIds: result.data.edgeIds
      })
      return true
    },
    frame: (bounds, options) => createFrame(
      context.write.node,
      context,
      bounds,
      options?.padding ?? DEFAULT_FRAME_PADDING
    )
  }
}
