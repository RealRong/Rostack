import * as Y from 'yjs'
import type {
  CollabSnapshot
} from '@shared/collab'
import type {
  SharedChange,
  SharedMeta,
  SharedCheckpoint,
  YjsSyncCodec,
  YjsSyncStore
} from '@dataview/collab/types'

export const YJS_SYNC_SCHEMA_VERSION = 1 as const

const META_KEY = 'meta'
const CHECKPOINT_KEY = 'checkpoint'
const CHANGES_KEY = 'changes'

const SCHEMA_VERSION_FIELD = 'schemaVersion'
const CHECKPOINT_ID_FIELD = 'id'
const CHECKPOINT_BLOB_FIELD = 'blob'

const isBinary = (
  value: unknown
): value is Uint8Array => value instanceof Uint8Array

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
  doc: Y.Doc
) => {
  const meta = getMetaMap(doc)
  const current = meta.get(SCHEMA_VERSION_FIELD)
  if (current === undefined) {
    meta.set(SCHEMA_VERSION_FIELD, YJS_SYNC_SCHEMA_VERSION)
    return
  }
  if (current !== YJS_SYNC_SCHEMA_VERSION) {
    throw new Error(`Unsupported Yjs sync schema version: ${String(current)}.`)
  }
}

const readMeta = (
  doc: Y.Doc
): SharedMeta => {
  const version = readSchemaVersion(doc)
  if (version === undefined) {
    return {
      schemaVersion: YJS_SYNC_SCHEMA_VERSION
    }
  }
  if (version !== YJS_SYNC_SCHEMA_VERSION) {
    throw new Error(`Unsupported Yjs sync schema version: ${String(version)}.`)
  }
  return {
    schemaVersion: YJS_SYNC_SCHEMA_VERSION
  }
}

const readRawChanges = (
  doc: Y.Doc,
  codec: YjsSyncCodec
): readonly SharedChange[] => getChangesArray(doc).toArray().map((value: Uint8Array) => {
  if (!isBinary(value)) {
    throw new Error('Shared change payload must be binary.')
  }
  return codec.decodeChange(value)
})

export type InternalYjsSyncStore = YjsSyncStore & {
  hasData(): boolean
  readSnapshot(): CollabSnapshot<SharedChange, SharedCheckpoint>
}

export const createYjsSyncStore = ({
  doc,
  codec
}: {
  doc: Y.Doc
  codec: YjsSyncCodec
}): InternalYjsSyncStore => {
  const readCheckpoint = () => {
    const checkpoint = getCheckpointMap(doc)
    const id = checkpoint.get(CHECKPOINT_ID_FIELD)
    const blob = checkpoint.get(CHECKPOINT_BLOB_FIELD)
    if (id === undefined && blob === undefined) {
      return null
    }
    if (typeof id !== 'string' || !isBinary(blob)) {
      throw new Error('Shared checkpoint payload is invalid.')
    }
    return codec.decodeCheckpoint(blob)
  }

  return {
    readMeta: () => readMeta(doc),
    readCheckpoint,
    readChanges: () => readRawChanges(doc, codec),
    appendChange: (change) => {
      ensureSchemaVersion(doc)
      getChangesArray(doc).push([codec.encodeChange(change)])
    },
    replaceCheckpoint: (checkpoint) => {
      ensureSchemaVersion(doc)
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
      const changes: SharedChange[] = []

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
