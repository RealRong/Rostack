import { changeSet } from '@shared/core'
import type { MutationPublishSpec } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  ChangeSet,
  Document,
  Operation
} from '@whiteboard/core/types'
import type {
  EngineDelta,
  EnginePublish
} from '../contracts/document'
import { createDocumentSnapshot } from '../document/create'
import type { WhiteboardMutationExtra } from './types'

const buildChange = (
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

const createInitialEntityChange = <TId extends string>(
  entities: Record<TId, unknown>
) => {
  const delta = changeSet.create<TId>()
  Object.keys(entities).forEach((id) => {
    changeSet.markAdded(delta, id as TId)
  })
  return delta
}

const createInitialChange = (
  document: Document
): EngineDelta => buildChange({
  document: true,
  background: true,
  canvasOrder: true,
  nodes: createInitialEntityChange(document.nodes),
  edges: createInitialEntityChange(document.edges),
  groups: createInitialEntityChange(document.groups),
  mindmaps: createInitialEntityChange(document.mindmaps)
} satisfies ChangeSet)

const createPublish = (input: {
  revision: number
  document: Document
  delta: EngineDelta
}): EnginePublish => ({
  rev: input.revision,
  snapshot: createDocumentSnapshot({
    revision: input.revision,
    document: input.document
  }),
  delta: input.delta
})

export const whiteboardPublishSpec: MutationPublishSpec<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardMutationExtra,
  EnginePublish
> = {
  init: (doc) => createPublish({
    revision: 0,
    document: doc,
    delta: createInitialChange(doc)
  }),
  reduce: ({
    doc,
    write
  }) => createPublish({
    revision: write.rev,
    document: doc,
    delta: buildChange(write.extra.changes)
  })
}
