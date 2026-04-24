import { changeSet } from '@shared/core'
import type { ChangeSet } from '@whiteboard/core/types'
import type { EngineDelta } from '../contracts/document'

export const changeFromReduce = (
  changes: ChangeSet
): EngineDelta => ({
  reset: changes.document,
  background: changes.background,
  order: changes.canvasOrder,
  nodes: changeSet.clone(changes.nodes),
  edges: changeSet.clone(changes.edges),
  mindmaps: changeSet.clone(changes.mindmaps),
  groups: changeSet.clone(changes.groups)
})
