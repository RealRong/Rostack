import { selection as selectionApi, type SelectionInput, type SelectionTarget } from '@whiteboard/core/selection'
import type {
  CanvasOrderAnchor,
  CanvasItemRef,
  GroupId
} from '@whiteboard/core/types'
import type { EditorCommand } from '@whiteboard/editor/state-engine/intents'
import type { EditorScene } from '@whiteboard/editor-scene'
import type { EditorDefaults } from '@whiteboard/editor/types/defaults'
import type { EditorState } from '@whiteboard/editor/types/editor'
import type {
  CanvasWrite,
  GroupWrite,
  NodeWrite
} from '@whiteboard/editor/write/types'
import type {
  SelectionActions
} from '@whiteboard/editor/action/types'

const DEFAULT_FRAME_PADDING = 32

export type SelectionActionHelpers = Pick<
  SelectionActions,
  'duplicate' | 'delete' | 'order' | 'group' | 'ungroup' | 'frame'
>

type SelectionActionHelpersHost = {
  read: EditorScene
  canvas: CanvasWrite
  group: GroupWrite
  node: Pick<NodeWrite, 'create'>
  selection: Pick<EditorState['selection'], 'get'>
  dispatch: (command: EditorCommand | readonly EditorCommand[]) => void
  defaults: EditorDefaults['templates']
}

const orderRefs = (
  canvas: Pick<CanvasWrite, 'order'>,
  refs: CanvasItemRef[],
  mode: 'front' | 'back' | 'forward' | 'backward'
) => mode === 'forward' || mode === 'backward'
  ? canvas.order.step(refs, mode)
  : canvas.order.move(refs, {
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
  dispatch: SelectionActionHelpersHost['dispatch'],
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

  dispatch({
    type: 'selection.set',
    selection: {
      nodeIds: [result.data.nodeId],
      edgeIds: []
    }
  })
  return true
}

const createSelectionActionHelpers = ({
  read,
  canvas,
  group,
  node,
  selection,
  dispatch,
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
      dispatch({
        type: 'selection.set',
        selection: {
          nodeIds: result.data.roots.nodeIds.length > 0
            ? result.data.roots.nodeIds
            : result.data.allNodeIds,
          edgeIds: result.data.roots.edgeIds.length > 0
            ? result.data.roots.edgeIds
            : result.data.allEdgeIds
        }
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
      dispatch({
        type: 'selection.set',
        selection: {
          nodeIds: [],
          edgeIds: []
        }
      })
    }

    return true
  },
  order: (input, mode) => {
    const target = selectionApi.target.normalize(input)
    const groupIds = read.groups.exact(target)
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

    dispatch({
      type: 'selection.set',
      selection: target
    })
    return true
  },
  ungroup: (input, options) => {
    const target = selectionApi.target.normalize(input)
    const groupIds = [...read.groups.exact(target)]
    if (!groupIds.length) {
      return false
    }

    const result = group.ungroup(groupIds)
    if (!result.ok) {
      return false
    }

    if (options?.fallbackSelection === 'none') {
      dispatch({
        type: 'selection.set',
        selection: {
          nodeIds: [],
          edgeIds: []
        }
      })
      return true
    }

    dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: result.data.nodeIds,
        edgeIds: result.data.edgeIds
      }
    })
    return true
  },
  frame: (bounds, options) => createFrame(
    node,
    dispatch,
    defaults,
    bounds,
    options?.padding ?? DEFAULT_FRAME_PADDING
  )
})

export const createSelectionActions = (input: {
  document: Pick<import('@whiteboard/editor-scene').DocumentFrame, 'nodeIds' | 'edgeIds'>
  read: EditorScene
  canvas: CanvasWrite
  group: GroupWrite
  node: Pick<NodeWrite, 'create'>
  selection: Pick<EditorState['selection'], 'get'>
  dispatch: SelectionActionHelpersHost['dispatch']
  defaults: EditorDefaults['templates']
}): SelectionActions => {
  const helpers = createSelectionActionHelpers(input)
  const applySelection = (
    mode: 'replace' | 'add' | 'subtract' | 'toggle',
    target: SelectionInput
  ) => {
    const selection = mode === 'replace'
      ? selectionApi.target.normalize(target)
      : selectionApi.target.apply(
          input.selection.get(),
          selectionApi.target.normalize(target),
          mode
        )

    input.dispatch({
      type: 'selection.set',
      selection
    })
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
        nodeIds: input.document.nodeIds(),
        edgeIds: input.document.edgeIds()
      })
    },
    clear: () => {
      applySelection('replace', {
        nodeIds: [],
        edgeIds: []
      })
    },
    ...helpers
  }
}
