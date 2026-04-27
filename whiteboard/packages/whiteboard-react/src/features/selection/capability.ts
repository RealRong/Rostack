import type { SelectionTarget } from '@whiteboard/core/selection'
import {
  resolveLockDecision
} from '@whiteboard/core/operations'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

export type SelectionCan = {
  order: boolean
  makeGroup: boolean
  ungroup: boolean
  copy: boolean
  cut: boolean
  duplicate: boolean
  delete: boolean
  align: boolean
  distribute: boolean
}

export const readSelectionCan = ({
  editor,
  target
}: {
  editor: WhiteboardRuntime
  target: SelectionTarget
}): SelectionCan => {
  const document = editor.document.get()
  const pureNodeSelection =
    target.nodeIds.length > 0
    && target.edgeIds.length === 0
  const count = target.nodeIds.length + target.edgeIds.length
  const exactGroupIds = editor.scene.query.group.exact(target)
  const orderLock = resolveLockDecision({
    document,
    target: {
      kind: 'refs',
      refs: [
        ...target.nodeIds.map((id) => ({ kind: 'node' as const, id })),
        ...target.edgeIds.map((id) => ({ kind: 'edge' as const, id }))
      ]
    }
  })
  const destructiveLock = resolveLockDecision({
    document,
    target: {
      kind: 'refs',
      refs: [
        ...target.nodeIds.map((id) => ({ kind: 'node' as const, id })),
        ...target.edgeIds.map((id) => ({ kind: 'edge' as const, id }))
      ],
      includeEdgeRelations: true
    }
  })
  const groupingLock = resolveLockDecision({
    document,
    target: {
      kind: 'nodes',
      nodeIds: target.nodeIds
    }
  })
  const ungroupLock = resolveLockDecision({
    document,
    target: {
      kind: 'groups',
      groupIds: exactGroupIds
    }
  })

  return {
    order: count > 0 && orderLock.allowed,
    makeGroup:
      count >= 2
      && groupingLock.allowed
      && !(exactGroupIds.length === 1),
    ungroup: exactGroupIds.length > 0 && ungroupLock.allowed,
    copy: count > 0,
    cut: count > 0 && destructiveLock.allowed,
    duplicate: count > 0 && destructiveLock.allowed,
    delete: count > 0 && destructiveLock.allowed,
    align:
      pureNodeSelection
      && target.nodeIds.length >= 2
      && groupingLock.allowed,
    distribute:
      pureNodeSelection
      && target.nodeIds.length >= 3
      && groupingLock.allowed
  }
}
