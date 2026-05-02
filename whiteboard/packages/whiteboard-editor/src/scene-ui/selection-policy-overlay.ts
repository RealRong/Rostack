import type {
  SelectionAffordance,
  SelectionSummary
} from '@whiteboard/core/selection'
import type { EditSession } from '@whiteboard/editor/schema/edit'
import type { SelectionOverlay } from '@whiteboard/editor/scene-ui/schema'
import type { Tool } from '@whiteboard/editor/schema/tool'

export const resolveSelectionOverlay = ({
  summary,
  affordance,
  tool,
  edit,
  interactionChrome,
  transforming
}: {
  summary: SelectionSummary
  affordance: SelectionAffordance
  tool: Tool
  edit: EditSession
  interactionChrome: boolean
  transforming: boolean
}): SelectionOverlay | undefined => {
  if (summary.items.count === 0 || summary.items.nodeCount === 0) {
    return undefined
  }

  const box = affordance.displayBox
  if (!box) {
    return undefined
  }

  const editing = edit !== null
  const hasResizeHandles = Boolean(
    affordance.transformPlan?.handles.some((handle) => handle.visible && handle.enabled)
  )
  const hasTransformChrome = hasResizeHandles || affordance.canRotate
  const showTransformHandles =
    tool.type === 'select'
    && !editing
    && hasTransformChrome
    && (transforming || interactionChrome)

  return affordance.showSingleNodeOverlay && affordance.ownerNodeId
    ? {
        kind: 'node',
        nodeId: affordance.ownerNodeId,
        handles: showTransformHandles
      }
    : {
        kind: 'selection',
        box,
        interactive:
          affordance.canMove
          && affordance.moveHit === 'body',
        frame: affordance.owner !== 'none',
        handles:
          showTransformHandles
          && hasResizeHandles,
        transformPlan: affordance.transformPlan
      }
}
