import * as Y from 'yjs'
import type { CollabSnapshot } from '@shared/collab'
import { isBinaryBytes } from './codec'

export type YjsSyncMeta<Version extends number = number> = {
  schemaVersion: Version
}

export type YjsSyncCodec<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
> = {
  encodeChange(change: Change): Uint8Array
  decodeChange(data: Uint8Array): Change
  encodeCheckpoint(checkpoint: Checkpoint): Uint8Array
  decodeCheckpoint(data: Uint8Array): Checkpoint
}

export type YjsSyncStore<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  },
  Meta extends YjsSyncMeta = YjsSyncMeta<1>
> = {
  readMeta(): Meta
  readCheckpoint(): Checkpoint | null
  readChanges(): readonly Change[]
  appendChange(change: Change): void
  replaceCheckpoint(checkpoint: Checkpoint): void
  clearChanges(): void
}

export type InternalYjsSyncStore<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  },
  Meta extends YjsSyncMeta = YjsSyncMeta<1>
> = YjsSyncStore<Change, Checkpoint, Meta> & {
  hasData(): boolean
  readSnapshot(): CollabSnapshot<Change, Checkpoint>
}

const YJS_SYNC_SCHEMA_VERSION = 1 as const

const META_KEY = 'meta'
const CHECKPOINT_KEY = 'checkpoint'
const CHANGES_KEY = 'changes'

const SCHEMA_VERSION_FIELD = 'schemaVersion'
const CHECKPOINT_ID_FIELD = 'id'
const CHECKPOINT_BLOB_FIELD = 'blob'

const getMetaMap = (
  doc: Y.Doc
): Y.Map<unknown> => doc.getMap(META_KEY)

const getCheckpointMap = (
  doc: Y.Doc
): Y.Map<unknown> => doc.getMap(CHECKPOINT_KEY)

const getChangesArray = (
  doc: Y.Doc
): Y.Array<Uint8Array> => doc.getArray(CHANGES_KEY)

const readSchemaVersion = (
  doc: Y.Doc
): number | undefined => {
  const value = getMetaMap(doc).get(SCHEMA_VERSION_FIELD)
  return typeof value === 'number'
    ? value
    : undefined
}

const ensureSchemaVersion = (
  doc: Y.Doc,
  schemaVersion: number
) => {
  const meta = getMetaMap(doc)
  const current = meta.get(SCHEMA_VERSION_FIELD)
  if (current === undefined) {
    meta.set(SCHEMA_VERSION_FIELD, schemaVersion)
    return
  }
  if (current !== schemaVersion) {
    throw new Error(`Unsupported Yjs sync schema version: ${String(current)}.`)
  }
}

const readMeta = <Meta extends YjsSyncMeta>(
  doc: Y.Doc,
  schemaVersion: Meta['schemaVersion']
): Meta => {
  const version = readSchemaVersion(doc)
  if (version === undefined) {
    return {
      schemaVersion
    } as Meta
  }
  if (version !== schemaVersion) {
    throw new Error(`Unsupported Yjs sync schema version: ${String(version)}.`)
  }
  return {
    schemaVersion
  } as Meta
}

const readRawChanges = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
>(
  doc: Y.Doc,
  codec: YjsSyncCodec<Change, Checkpoint>
): readonly Change[] => getChangesArray(doc).toArray().map((value: Uint8Array) => {
  if (!isBinaryBytes(value)) {
    throw new Error('Shared change payload must be binary.')
  }
  return codec.decodeChange(value)
})

export const createYjsSyncStore = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  },
  Meta extends YjsSyncMeta = YjsSyncMeta<1>
>({
  doc,
  codec,
  schemaVersion = YJS_SYNC_SCHEMA_VERSION as Meta['schemaVersion']
}: {
  doc: Y.Doc
  codec: YjsSyncCodec<Change, Checkpoint>
  schemaVersion?: Meta['schemaVersion']
}): InternalYjsSyncStore<Change, Checkpoint, Meta> => {
  const readCheckpoint = () => {
    const checkpoint = getCheckpointMap(doc)
    const id = checkpoint.get(CHECKPOINT_ID_FIELD)
    const blob = checkpoint.get(CHECKPOINT_BLOB_FIELD)
    if (id === undefined && blob === undefined) {
      return null
    }
    if (typeof id !== 'string' || !isBinaryBytes(blob)) {
      throw new Error('Shared checkpoint payload is invalid.')
    }
    return codec.decodeCheckpoint(blob)
  }

  return {
    readMeta: () => readMeta<Meta>(doc, schemaVersion),
    readCheckpoint,
    readChanges: () => readRawChanges(doc, codec),
    appendChange: (change) => {
      ensureSchemaVersion(doc, schemaVersion)
      getChangesArray(doc).push([codec.encodeChange(change)])
    },
    replaceCheckpoint: (checkpoint) => {
      ensureSchemaVersion(doc, schemaVersion)
      const target = getCheckpointMap(doc)
      target.set(CHECKPOINT_ID_FIELD, checkpoint.id)
      target.set(CHECKPOINT_BLOB_FIELD, codec.encodeCheckpoint(checkpoint))
    },
    clearChanges: () => {
      const changes = getChangesArray(doc)
      if (changes.length > 0) {
        changes.delete(0, changes.length)
      }
    },
    hasData: () => {
      const checkpoint = getCheckpointMap(doc)
      return checkpoint.has(CHECKPOINT_ID_FIELD)
        || checkpoint.has(CHECKPOINT_BLOB_FIELD)
        || getChangesArray(doc).length > 0
    },
    readSnapshot: () => {
      const seen = new Set<string>()
      const duplicateIds = new Set<string>()
      const changes: Change[] = []

      readRawChanges(doc, codec).forEach((change) => {
        if (seen.has(change.id)) {
          duplicateIds.add(change.id)
          return
        }
        seen.add(change.id)
        changes.push(change)
      })

      return {
        checkpoint: readCheckpoint(),
        changes,
        duplicateChangeIds: [...duplicateIds]
      }
    }
  }
}
