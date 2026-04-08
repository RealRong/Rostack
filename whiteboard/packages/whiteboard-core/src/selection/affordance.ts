import type { NodeRole, NodeTransform } from '../node'
import type { Node, NodeId, Rect } from '../types'
import { isSameOptionalRectTuple } from '../utils'
import type { SelectionSummary } from './summary'

export type SelectionAffordanceOwner =
  | 'none'
  | 'single-node'
  | 'multi-selection'

export type SelectionAffordanceMoveHit = 'none' | 'body'

export type SelectionAffordance = {
  owner: SelectionAffordanceOwner
  ownerNodeId?: NodeId
  displayBox?: Rect
  transformBox?: Rect
  moveHit: SelectionAffordanceMoveHit
  canMove: boolean
  canResize: boolean
  canRotate: boolean
  showSingleNodeOverlay: boolean
}

const EMPTY_AFFORDANCE: SelectionAffordance = {
  owner: 'none',
  moveHit: 'none',
  canMove: false,
  canResize: false,
  canRotate: false,
  showSingleNodeOverlay: false
}

export const deriveSelectionAffordance = ({
  selection,
  transformBox,
  resolveNodeRole,
  resolveNodeTransformCapability
}: {
  selection: SelectionSummary
  transformBox?: Rect
  resolveNodeRole: (node: Node) => NodeRole
  resolveNodeTransformCapability: (node: Node) => NodeTransform
}): SelectionAffordance => {
  const displayBox = selection.box
  const primaryNode = selection.items.primaryNode
  const nodeCount = selection.items.nodeCount
  const edgeCount = selection.items.edgeCount

  if (!primaryNode || nodeCount === 0) {
    return {
      ...EMPTY_AFFORDANCE,
      displayBox,
      transformBox
    }
  }

  const role = resolveNodeRole(primaryNode)
  const capability = resolveNodeTransformCapability(primaryNode)

  if (nodeCount === 1 && edgeCount === 0) {
    if (role === 'frame') {
      return {
        owner: 'single-node',
        ownerNodeId: primaryNode.id,
        displayBox,
        transformBox: transformBox ?? displayBox,
        moveHit:
          selection.transform.move && Boolean(displayBox)
            ? 'body'
            : 'none',
        canMove: selection.transform.move && Boolean(displayBox),
        canResize: !primaryNode.locked && capability.resize,
        canRotate: false,
        showSingleNodeOverlay: false
      }
    }

    return {
      owner: 'single-node',
      ownerNodeId: primaryNode.id,
      displayBox,
      transformBox: transformBox ?? displayBox,
      moveHit:
        selection.transform.move && Boolean(displayBox)
          ? 'body'
          : 'none',
      canMove: selection.transform.move && Boolean(displayBox),
      canResize: !primaryNode.locked && capability.resize,
      canRotate: !primaryNode.locked && capability.rotate,
      showSingleNodeOverlay: true
    }
  }

  return {
    owner: 'multi-selection',
    displayBox,
    transformBox,
    moveHit:
      selection.transform.move
      && nodeCount > 0
      && Boolean(displayBox)
        ? 'body'
        : 'none',
    canMove:
      selection.transform.move
      && nodeCount > 0
      && Boolean(displayBox),
    canResize:
      Boolean(transformBox)
      && selection.transform.resize !== 'none',
    canRotate: false,
    showSingleNodeOverlay: false
  }
}

export const isSelectionAffordanceEqual = (
  left: SelectionAffordance,
  right: SelectionAffordance
) => (
  left.owner === right.owner
  && left.ownerNodeId === right.ownerNodeId
  && left.moveHit === right.moveHit
  && left.canMove === right.canMove
  && left.canResize === right.canResize
  && left.canRotate === right.canRotate
  && left.showSingleNodeOverlay === right.showSingleNodeOverlay
  && isSameOptionalRectTuple(left.displayBox, right.displayBox)
  && isSameOptionalRectTuple(left.transformBox, right.transformBox)
)
