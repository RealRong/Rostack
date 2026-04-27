import { idDelta } from '@shared/delta'
import type { MutationPublishSpec } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/operations'
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
  nodes: idDelta.clone(changes.nodes),
  edges: idDelta.clone(changes.edges),
  mindmaps: idDelta.clone(changes.mindmaps),
  groups: idDelta.clone(changes.groups)
})

const createInitialEntityChange = <TId extends string>(
  entities: Record<TId, unknown>
) => {
  const delta = idDelta.create<TId>()
  Object.keys(entities).forEach((id) => {
    idDelta.add(delta, id as TId)
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
  EnginePublish,
  void
> = {
  init: (doc) => ({
    publish: createPublish({
      revision: 0,
      document: doc,
      delta: createInitialChange(doc)
    }),
    cache: undefined
  }),
  reduce: ({
    doc,
    commit
  }) => ({
    publish: createPublish({
      revision: commit.rev,
      document: doc,
      delta: buildChange(commit.extra.changes)
    }),
    cache: undefined
  })
}
