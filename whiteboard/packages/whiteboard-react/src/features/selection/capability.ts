import type { SelectionSummary } from '@whiteboard/core/selection'
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
  summary
}: {
  editor: WhiteboardRuntime
  summary: SelectionSummary
}): SelectionCan => {
  const pureNodeSelection =
    summary.items.nodeCount > 0
    && summary.items.edgeCount === 0
  const exactGroupIds = editor.read.group.exactIds(summary.target)

  return {
    order: summary.items.count > 0,
    makeGroup:
      summary.items.count >= 2
      && !(exactGroupIds.length === 1),
    ungroup: exactGroupIds.length > 0,
    copy: summary.items.count > 0,
    cut: summary.items.count > 0,
    duplicate: summary.items.count > 0,
    delete: summary.items.count > 0,
    align: pureNodeSelection && summary.items.nodeCount >= 2,
    distribute: pureNodeSelection && summary.items.nodeCount >= 3
  }
}
