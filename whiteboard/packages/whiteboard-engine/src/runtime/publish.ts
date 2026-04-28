import {
  idDelta
} from '@shared/delta'
import type {
  MutationChange,
  MutationCommitRecord,
  MutationDelta
} from '@shared/mutation'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import {
  createDocumentSnapshot
} from '../document/create'
import type {
  EngineDelta,
  EnginePublish
} from '../contracts/document'

type EntityFamily = 'node' | 'edge' | 'group' | 'mindmap'

type ChangeObject = Exclude<MutationChange, true | readonly string[]>

const readEntityTable = (
  document: Document,
  family: EntityFamily
) => {
  switch (family) {
    case 'node':
      return document.nodes
    case 'edge':
      return document.edges
    case 'group':
      return document.groups
    case 'mindmap':
      return document.mindmaps
  }
}

const createInitialEntityDelta = (
  entities: Record<string, unknown>
) => {
  const delta = idDelta.create<string>()
  Object.keys(entities).forEach((id) => {
    idDelta.add(delta, id)
  })
  return delta
}

const createInitialDelta = (
  document: Document
): EngineDelta => ({
  reset: true,
  background: true,
  order: true,
  nodes: createInitialEntityDelta(document.nodes),
  edges: createInitialEntityDelta(document.edges),
  groups: createInitialEntityDelta(document.groups),
  mindmaps: createInitialEntityDelta(document.mindmaps)
})

const readChangeIds = (
  change: MutationChange | undefined,
  document: Document,
  family: EntityFamily
): readonly string[] => {
  if (!change) {
    return []
  }
  if (change === true) {
    return Object.keys(readEntityTable(document, family))
  }
  if (Array.isArray(change)) {
    return change
  }
  if (!isChangeObject(change)) {
    return []
  }
  if (change.ids === 'all') {
    return Object.keys(readEntityTable(document, family))
  }
  return change.ids ?? []
}

const isChangeObject = (
  change: MutationChange
): change is ChangeObject => (
  typeof change === 'object'
  && change !== null
  && !Array.isArray(change)
)

const buildEntityDelta = (
  document: Document,
  family: EntityFamily,
  changes: MutationDelta['changes']
): import('@shared/delta').IdDelta<string> => {
  const delta = idDelta.create<string>()
  const added = readChangeIds(changes?.[`${family}.create`], document, family)
  const removed = readChangeIds(changes?.[`${family}.delete`], document, family)

  added.forEach((id) => {
    idDelta.add(delta, id)
  })
  removed.forEach((id) => {
    idDelta.remove(delta, id)
  })

  Object.entries(changes ?? {}).forEach(([key, change]) => {
    if (!key.startsWith(`${family}.`) || key === `${family}.create` || key === `${family}.delete`) {
      return
    }

    readChangeIds(change, document, family).forEach((id) => {
      idDelta.update(delta, id)
    })
  })

  return delta
}

const hasFlag = (
  change: MutationChange | undefined
): boolean => change !== undefined

export const createEngineDelta = (input: {
  document: Document
  delta: MutationDelta
  reset?: boolean
}): EngineDelta => {
  if (input.reset || input.delta.reset) {
    return createInitialDelta(input.document)
  }

  return {
    reset: false,
    background: hasFlag(input.delta.changes?.['document.background']),
    order: hasFlag(input.delta.changes?.['canvas.order']),
    nodes: buildEntityDelta(input.document, 'node', input.delta.changes),
    edges: buildEntityDelta(input.document, 'edge', input.delta.changes),
    groups: buildEntityDelta(input.document, 'group', input.delta.changes),
    mindmaps: buildEntityDelta(input.document, 'mindmap', input.delta.changes)
  }
}

export const createEnginePublish = (input: {
  revision: number
  document: Document
  delta: MutationDelta
  reset?: boolean
}): EnginePublish => ({
  rev: input.revision,
  snapshot: createDocumentSnapshot({
    revision: input.revision,
    document: input.document
  }),
  delta: createEngineDelta({
    document: input.document,
    delta: input.delta,
    reset: input.reset
  })
})

export const createInitialEnginePublish = (
  document: Document
): EnginePublish => createEnginePublish({
  revision: 0,
  document,
  delta: {
    reset: true
  },
  reset: true
})

export const createEnginePublishFromCommit = (
  commit: MutationCommitRecord<Document, Operation>
): EnginePublish => createEnginePublish({
  revision: commit.rev,
  document: commit.document,
  delta: commit.delta,
  reset: commit.kind === 'replace'
    || (commit.kind === 'apply' && commit.forward.some((op) => op.type === 'document.create'))
})
