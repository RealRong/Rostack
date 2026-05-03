import * as Y from 'yjs'
import type { CollabSnapshot } from '@shared/collab'
import { isBinaryBytes } from './codec'

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
  }
> = {
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
  }
> = YjsSyncStore<Change, Checkpoint> & {
  hasData(): boolean
  readSnapshot(): CollabSnapshot<Change, Checkpoint>
}

const CHECKPOINT_KEY = 'checkpoint'
const CHANGES_KEY = 'changes'
const CHECKPOINT_ID_FIELD = 'id'
const CHECKPOINT_BLOB_FIELD = 'blob'

const getCheckpointMap = (
  doc: Y.Doc
): Y.Map<unknown> => doc.getMap(CHECKPOINT_KEY)

const getChangesArray = (
  doc: Y.Doc
): Y.Array<Uint8Array> => doc.getArray(CHANGES_KEY)

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
  }
>({
  doc,
  codec
}: {
  doc: Y.Doc
  codec: YjsSyncCodec<Change, Checkpoint>
}): InternalYjsSyncStore<Change, Checkpoint> => {
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
    readCheckpoint,
    readChanges: () => readRawChanges(doc, codec),
    appendChange: (change) => {
      getChangesArray(doc).push([codec.encodeChange(change)])
    },
    replaceCheckpoint: (checkpoint) => {
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
