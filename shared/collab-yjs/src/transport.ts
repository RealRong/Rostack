import * as Y from 'yjs'
import type {
  CollabProvider,
  CollabStore
} from '@shared/collab'
import { createCollabLocalOrigin } from './localOrigin'
import {
  createYjsSyncStore,
  type InternalYjsSyncStore,
  type YjsSyncCodec,
  type YjsSyncMeta
} from './store'

export type YjsCollabTransport<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  },
  Meta extends YjsSyncMeta = YjsSyncMeta<1>
> = {
  store: CollabStore<Change, Checkpoint>
  provider?: CollabProvider
  awareness?: unknown
  origin: unknown
  syncStore: InternalYjsSyncStore<Change, Checkpoint, Meta>
}

export const createSharedStore = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  },
  Meta extends YjsSyncMeta = YjsSyncMeta<1>
>({
  doc,
  localOrigin,
  syncStore
}: {
  doc: Y.Doc
  localOrigin: unknown
  syncStore: InternalYjsSyncStore<Change, Checkpoint, Meta>
}): CollabStore<Change, Checkpoint> => ({
  read: () => {
    syncStore.readMeta()
    return syncStore.readSnapshot()
  },
  subscribe: (listener) => {
    const handleAfterTransaction = (
      transaction: Y.Transaction
    ) => {
      if (transaction.origin === localOrigin) {
        return
      }
      listener()
    }
    doc.on('afterTransaction', handleAfterTransaction)
    return () => {
      doc.off('afterTransaction', handleAfterTransaction)
    }
  },
  append: (change) => {
    doc.transact(() => {
      syncStore.appendChange(change)
    }, localOrigin)
  },
  checkpoint: (checkpoint) => {
    doc.transact(() => {
      syncStore.replaceCheckpoint(checkpoint)
    }, localOrigin)
  },
  clearChanges: () => {
    doc.transact(() => {
      syncStore.clearChanges()
    }, localOrigin)
  }
})

export const createYjsCollabTransport = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  },
  Meta extends YjsSyncMeta = YjsSyncMeta<1>
>({
  doc,
  provider,
  codec,
  origin = createCollabLocalOrigin(),
  schemaVersion
}: {
  doc: Y.Doc
  provider?: CollabProvider
  codec: YjsSyncCodec<Change, Checkpoint>
  origin?: unknown
  schemaVersion?: Meta['schemaVersion']
}): YjsCollabTransport<Change, Checkpoint, Meta> => {
  const syncStore = createYjsSyncStore<Change, Checkpoint, Meta>({
    doc,
    codec,
    ...(schemaVersion === undefined
      ? {}
      : {
          schemaVersion
        })
  })

  return {
    store: createSharedStore({
      doc,
      localOrigin: origin,
      syncStore
    }),
    provider,
    awareness: provider?.awareness,
    origin,
    syncStore
  }
}
