import type { ChangeSet } from '@whiteboard/core/types'
import type { EngineChange } from '../contracts/document'

const toIdDelta = <T,>(input: {
  added: ReadonlySet<T>
  updated: ReadonlySet<T>
  removed: ReadonlySet<T>
}) => ({
  added: new Set(input.added),
  updated: new Set(input.updated),
  removed: new Set(input.removed)
})

const hasAny = (values: readonly boolean[]) => values.some(Boolean)
const hasIdChange = <T,>(input: {
  added: ReadonlySet<T>
  updated: ReadonlySet<T>
  removed: ReadonlySet<T>
}) => (
  input.added.size
  + input.updated.size
  + input.removed.size
) > 0

export const changeFromReduce = (
  changeSet: ChangeSet
): EngineChange => {
  const nodeTouched = hasIdChange(changeSet.nodes)
  const edgeTouched = hasIdChange(changeSet.edges)
  const groupTouched = hasIdChange(changeSet.groups)
  const mindmapTouched = hasIdChange(changeSet.mindmaps)

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
