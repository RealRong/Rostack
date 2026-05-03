import * as Y from 'yjs'
import type {
  CollabProvider,
  MutationCollabChange,
  MutationCollabCheckpoint,
  MutationCollabEngine,
  MutationCollabSession,
} from '@shared/collab'
import {
  createMutationCollabSession,
} from '@shared/collab'
import type {
  MutationDocument,
  MutationSchema,
  SerializedMutationWrite,
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

const assertSerializedWrites = (
  value: unknown
): readonly SerializedMutationWrite[] => {
  if (!Array.isArray(value)) {
    throw new Error('Shared mutation writes payload is invalid.')
  }

  value.forEach((entry) => {
    if (
      !isRecord(entry)
      || typeof entry.kind !== 'string'
      || typeof entry.schemaNodeId !== 'string'
    ) {
      throw new Error('Shared mutation write entry is invalid.')
    }
  })

  return value as readonly SerializedMutationWrite[]
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
      writes: assertSerializedWrites(value.writes)
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
