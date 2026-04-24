import { changeSet } from '@shared/core'
import type { ChangeSet } from '@whiteboard/core/types'
import type { EngineChange } from '../contracts/document'

const hasAny = (values: readonly boolean[]) => values.some(Boolean)

export const changeFromReduce = (
  changes: ChangeSet
): EngineChange => {
  const nodeTouched = changeSet.hasAny(changes.nodes)
  const edgeTouched = changeSet.hasAny(changes.edges)
  const groupTouched = changeSet.hasAny(changes.groups)
  const mindmapTouched = changeSet.hasAny(changes.mindmaps)

  return {
    root: {
      doc: changes.document,
      background: changes.background,
      order: changes.canvasOrder
    },
    entities: {
      nodes: changeSet.clone(changes.nodes),
      edges: changeSet.clone(changes.edges),
      mindmaps: changeSet.clone(changes.mindmaps),
      groups: changeSet.clone(changes.groups)
    },
    relations: {
      graph: hasAny([
        nodeTouched,
        edgeTouched,
        changes.canvasOrder,
        changes.document
      ]),
      ownership: hasAny([
        nodeTouched,
        groupTouched,
        mindmapTouched,
        changes.document
      ]),
      hierarchy: hasAny([
        mindmapTouched,
        changes.document
      ])
    }
  }
}
