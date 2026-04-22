import type { ChangeSet } from '@whiteboard/core/types'
import type { EngineChange } from '../contracts/document'

const toIdDelta = <T,>(input: {
  add: ReadonlySet<T>
  update: ReadonlySet<T>
  delete: ReadonlySet<T>
}) => ({
  added: new Set(input.add),
  updated: new Set(input.update),
  removed: new Set(input.delete)
})

const hasAny = (values: readonly boolean[]) => values.some(Boolean)

export const changeFromReduce = (
  changeSet: ChangeSet
): EngineChange => {
  const nodeTouched = (
    changeSet.nodes.add.size
    + changeSet.nodes.update.size
    + changeSet.nodes.delete.size
  ) > 0
  const edgeTouched = (
    changeSet.edges.add.size
    + changeSet.edges.update.size
    + changeSet.edges.delete.size
  ) > 0
  const groupTouched = (
    changeSet.groups.add.size
    + changeSet.groups.update.size
    + changeSet.groups.delete.size
  ) > 0
  const mindmapTouched = (
    changeSet.mindmaps.add.size
    + changeSet.mindmaps.update.size
    + changeSet.mindmaps.delete.size
  ) > 0

  return {
    root: {
      doc: changeSet.document,
      background: changeSet.background,
      order: changeSet.canvasOrder
    },
    entities: {
      nodes: toIdDelta(changeSet.nodes),
      edges: toIdDelta(changeSet.edges),
      mindmaps: toIdDelta(changeSet.mindmaps),
      groups: toIdDelta(changeSet.groups)
    },
    relations: {
      graph: hasAny([
        nodeTouched,
        edgeTouched,
        changeSet.canvasOrder,
        changeSet.document
      ]),
      ownership: hasAny([
        nodeTouched,
        groupTouched,
        mindmapTouched,
        changeSet.document
      ]),
      hierarchy: hasAny([
        mindmapTouched,
        changeSet.document
      ])
    }
  }
}
