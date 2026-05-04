import * as Y from 'yjs'
import type {
  CollabProvider,
  MutationCollabChange,
  MutationCollabCheckpoint,
  MutationCollabEngine,
  MutationCollabWrite,
  MutationCollabSession,
} from '@shared/collab'
import {
  createMutationCollabSession,
} from '@shared/collab'
import type {
  MutationEntityTarget,
  MutationDocument,
  MutationSchema,
} from '@shared/mutation'
import {
  createYjsCollabTransport,
} from './transport'
import {
  decodeJsonBytes,
  encodeJsonBytes,
} from './codec'
import type {
  YjsSyncCodec,
} from './store'

const isRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const isStringArray = (
  value: unknown
): value is readonly string[] => (
  Array.isArray(value)
  && value.every((entry) => typeof entry === 'string')
)

const isEntityTarget = (
  value: unknown
): value is MutationEntityTarget => (
  isRecord(value)
  && isStringArray(value.scope)
  && typeof value.id === 'string'
)

const isSequenceAnchor = (
  value: unknown
): boolean => {
  if (!isRecord(value)) {
    return false
  }

  if ('before' in value) {
    return typeof value.before === 'string'
  }

  if ('after' in value) {
    return typeof value.after === 'string'
  }

  return value.at === 'start' || value.at === 'end'
}

const isTreeInsertInput = (
  value: unknown
): boolean => (
  isRecord(value)
  && (value.parentId === undefined || typeof value.parentId === 'string')
  && (value.index === undefined || typeof value.index === 'number')
)

const isTreeMoveInput = (
  value: unknown
): boolean => (
  isRecord(value)
  && (value.parentId === undefined || typeof value.parentId === 'string')
  && (value.index === undefined || typeof value.index === 'number')
)

const isTreeSnapshot = (
  value: unknown
): boolean => {
  if (!isRecord(value) || !isRecord(value.nodes)) {
    return false
  }

  if (value.rootId !== undefined && typeof value.rootId !== 'string') {
    return false
  }

  return Object.values(value.nodes).every((entry) => (
    isRecord(entry)
    && Array.isArray(entry.children)
    && entry.children.every((child) => typeof child === 'string')
    && (entry.parentId === undefined || typeof entry.parentId === 'string')
  ))
}

const isDictionaryRecord = (
  value: unknown
): value is Readonly<Record<string, unknown>> => (
  isRecord(value)
)

const assertOptionalTarget = (value: unknown): MutationEntityTarget | undefined => {
  if (value === undefined) {
    return undefined
  }
  if (!isEntityTarget(value)) {
    throw new Error('Shared mutation write target is invalid.')
  }
  return value
}

const assertRequiredTarget = (value: unknown): MutationEntityTarget => {
  if (!isEntityTarget(value)) {
    throw new Error('Shared mutation write target is required.')
  }
  return value
}

const assertOptionalAnchor = (value: unknown): void => {
  if (value !== undefined && !isSequenceAnchor(value)) {
    throw new Error('Shared mutation write anchor is invalid.')
  }
}

const assertMutationWrite = (
  value: unknown
): MutationCollabWrite => {
  if (!isRecord(value) || typeof value.kind !== 'string' || typeof value.nodeId !== 'number') {
    throw new Error('Shared mutation write entry is invalid.')
  }

  switch (value.kind) {
    case 'field.set':
      assertOptionalTarget(value.target)
      return value as MutationCollabWrite

    case 'dictionary.set':
      assertOptionalTarget(value.target)
      if (typeof value.key !== 'string') {
        throw new Error('Shared mutation dictionary.set key is invalid.')
      }
      return value as MutationCollabWrite

    case 'dictionary.delete':
      assertOptionalTarget(value.target)
      if (typeof value.key !== 'string') {
        throw new Error('Shared mutation dictionary.delete key is invalid.')
      }
      return value as MutationCollabWrite

    case 'dictionary.replace':
      assertOptionalTarget(value.target)
      if (!isDictionaryRecord(value.value)) {
        throw new Error('Shared mutation dictionary.replace value is invalid.')
      }
      return value as MutationCollabWrite

    case 'entity.create':
      assertRequiredTarget(value.target)
      assertOptionalAnchor(value.anchor)
      return value as MutationCollabWrite

    case 'entity.remove':
      assertRequiredTarget(value.target)
      return value as MutationCollabWrite

    case 'entity.move':
      assertRequiredTarget(value.target)
      assertOptionalAnchor(value.anchor)
      return value as MutationCollabWrite

    case 'sequence.insert':
      assertOptionalTarget(value.target)
      assertOptionalAnchor(value.anchor)
      return value as MutationCollabWrite

    case 'sequence.move':
      assertOptionalTarget(value.target)
      assertOptionalAnchor(value.anchor)
      return value as MutationCollabWrite

    case 'sequence.remove':
      assertOptionalTarget(value.target)
      return value as MutationCollabWrite

    case 'sequence.replace':
      assertOptionalTarget(value.target)
      if (!Array.isArray(value.value)) {
        throw new Error('Shared mutation sequence.replace value is invalid.')
      }
      return value as MutationCollabWrite

    case 'tree.insert':
      assertOptionalTarget(value.target)
      if (typeof value.treeNodeId !== 'string' || !isTreeInsertInput(value.value)) {
        throw new Error('Shared mutation tree.insert payload is invalid.')
      }
      return value as MutationCollabWrite

    case 'tree.move':
      assertOptionalTarget(value.target)
      if (typeof value.treeNodeId !== 'string' || !isTreeMoveInput(value.value)) {
        throw new Error('Shared mutation tree.move payload is invalid.')
      }
      return value as MutationCollabWrite

    case 'tree.remove':
      assertOptionalTarget(value.target)
      if (typeof value.treeNodeId !== 'string') {
        throw new Error('Shared mutation tree.remove treeNodeId is invalid.')
      }
      return value as MutationCollabWrite

    case 'tree.patch':
      assertOptionalTarget(value.target)
      if (typeof value.treeNodeId !== 'string' || !isDictionaryRecord(value.value)) {
        throw new Error('Shared mutation tree.patch payload is invalid.')
      }
      return value as MutationCollabWrite

    case 'tree.replace':
      assertOptionalTarget(value.target)
      if (!isTreeSnapshot(value.value)) {
        throw new Error('Shared mutation tree.replace value is invalid.')
      }
      return value as MutationCollabWrite

    default:
      throw new Error('Shared mutation write kind is invalid.')
  }
}

const assertMutationWrites = (
  value: unknown
): readonly MutationCollabWrite[] => {
  if (!Array.isArray(value)) {
    throw new Error('Shared mutation writes payload is invalid.')
  }

  return value.map((entry) => assertMutationWrite(entry))
}

export type MutationYjsSyncCodec<TDocument> = YjsSyncCodec<
  MutationCollabChange,
  MutationCollabCheckpoint<TDocument>
>

export type CreateYjsMutationCollabSessionOptions<
  TSchema extends MutationSchema,
  TApplyResult,
  TDocument = MutationDocument<TSchema>
> = {
  schema: TSchema
  engine: MutationCollabEngine<TSchema, TApplyResult>
  doc: Y.Doc
  actorId: string
  provider?: CollabProvider
  checkpointThreshold?: number
  createChangeId?: () => string
  codec?: MutationYjsSyncCodec<TDocument>
  document: {
    empty(): TDocument
    decode(value: unknown): TDocument
    encode?(document: TDocument): unknown
  }
}

export const createMutationYjsCodec = <TDocument>(input: {
  document: {
    decode(value: unknown): TDocument
    encode?(document: TDocument): unknown
  }
}): MutationYjsSyncCodec<TDocument> => ({
  encodeChange: (change) => encodeJsonBytes(change),
  decodeChange: (data) => {
    const value = decodeJsonBytes(data)
    if (!isRecord(value)) {
      throw new Error('Shared change must be an object.')
    }
    if (typeof value.id !== 'string' || value.id.length === 0) {
      throw new Error('Shared change id is required.')
    }
    if (typeof value.actorId !== 'string' || value.actorId.length === 0) {
      throw new Error('Shared change actorId is required.')
    }

    return {
      id: value.id,
      actorId: value.actorId,
      writes: assertMutationWrites(value.writes)
    }
  },
  encodeCheckpoint: (checkpoint) => encodeJsonBytes({
    id: checkpoint.id,
    document: input.document.encode
      ? input.document.encode(checkpoint.document)
      : checkpoint.document
  }),
  decodeCheckpoint: (data) => {
    const value = decodeJsonBytes(data)
    if (!isRecord(value)) {
      throw new Error('Shared checkpoint must be an object.')
    }
    if (typeof value.id !== 'string' || value.id.length === 0) {
      throw new Error('Shared checkpoint id is required.')
    }

    return {
      id: value.id,
      document: input.document.decode(value.document)
    }
  }
})

const defaultCreateChangeId = (): string => (
  typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
)

export const createYjsMutationCollabSession = <
  TSchema extends MutationSchema,
  TApplyResult,
  TDocument = MutationDocument<TSchema>
>(
  input: CreateYjsMutationCollabSessionOptions<TSchema, TApplyResult, TDocument>
): MutationCollabSession<TApplyResult> => {
  if (input.actorId.length === 0) {
    throw new Error('createYjsMutationCollabSession requires a non-empty actorId.')
  }

  const codec = input.codec ?? createMutationYjsCodec({
    document: input.document
  })
  const transport = createYjsCollabTransport<
    MutationCollabChange,
    MutationCollabCheckpoint<TDocument>
  >({
    doc: input.doc,
    provider: input.provider,
    codec
  })

  return createMutationCollabSession(input.engine, {
    schema: input.schema,
    actor: {
      id: input.actorId,
      createChangeId: input.createChangeId ?? defaultCreateChangeId
    },
    transport: {
      store: transport.store as import('@shared/collab').CollabStore<
        MutationCollabChange,
        MutationCollabCheckpoint<MutationDocument<TSchema>>
      >,
      provider: transport.provider
    },
    document: {
      empty: input.document.empty as () => MutationDocument<TSchema>,
      checkpointEvery: input.checkpointThreshold
    }
  })
}
