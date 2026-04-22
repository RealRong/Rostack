import type { ChangeSet } from '@whiteboard/core/types'
import type { Change } from '../contracts/document'

const collectIds = <T,>(input: {
  add: ReadonlySet<T>
  update: ReadonlySet<T>
  delete: ReadonlySet<T>
}): ReadonlySet<T> => new Set<T>([
  ...input.add,
  ...input.update,
  ...input.delete
])

const hasAny = (values: readonly boolean[]) => values.some(Boolean)

export const changeFromReduce = (
  changeSet: ChangeSet
): Change => {
  const nodeIds = collectIds(changeSet.nodes)
  const edgeIds = collectIds(changeSet.edges)
  const groupIds = collectIds(changeSet.groups)
  const mindmapIds = collectIds(changeSet.mindmaps)

  return {
    root: {
      changed: hasAny([
        changeSet.document,
        changeSet.background,
        changeSet.canvasOrder
      ])
    },
    entities: {
      nodes: {
        all: nodeIds
      },
      edges: {
        all: edgeIds
      },
      owners: {
        mindmaps: {
          all: mindmapIds
        },
        groups: {
          all: groupIds
        }
      }
    },
    relations: {
      graph: {
        changed: hasAny([
          nodeIds.size > 0,
          edgeIds.size > 0,
          changeSet.canvasOrder,
          changeSet.document
        ])
      },
      ownership: {
        changed: hasAny([
          nodeIds.size > 0,
          groupIds.size > 0,
          mindmapIds.size > 0,
          changeSet.document
        ])
      },
      hierarchy: {
        changed: hasAny([
          mindmapIds.size > 0,
          changeSet.document
        ])
      }
    }
  }
}
