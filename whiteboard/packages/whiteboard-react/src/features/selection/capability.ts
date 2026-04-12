import type { SelectionTarget } from '@whiteboard/core/selection'
import type { WhiteboardRuntime } from '#react/types/runtime'

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
  const pureNodeSelection =
    target.nodeIds.length > 0
    && target.edgeIds.length === 0
  const count = target.nodeIds.length + target.edgeIds.length
  const exactGroupIds = editor.read.group.exactIds(target)

  return {
    order: count > 0,
    makeGroup:
      count >= 2
      && !(exactGroupIds.length === 1),
    ungroup: exactGroupIds.length > 0,
    copy: count > 0,
    cut: count > 0,
    duplicate: count > 0,
    delete: count > 0,
    align: pureNodeSelection && target.nodeIds.length >= 2,
    distribute: pureNodeSelection && target.nodeIds.length >= 3
  }
}
