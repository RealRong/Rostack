import * as Y from 'yjs'
import type {
  CollabProvider,
  CollabStore
} from '@shared/collab'
import { createCollabLocalOrigin } from './localOrigin'
import {
  createYjsSyncStore,
  type InternalYjsSyncStore,
  type YjsSyncCodec
} from './store'

export type YjsCollabTransport<
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
> = {
  store: CollabStore<Change, Checkpoint>
  provider?: CollabProvider
  awareness?: unknown
  origin: unknown
  syncStore: InternalYjsSyncStore<Change, Checkpoint>
}

export const createSharedStore = <
  Change extends {
    id: string
  },
  Checkpoint extends {
    id: string
  }
>({
  doc,
  localOrigin,
  syncStore
}: {
  doc: Y.Doc
  localOrigin: unknown
  syncStore: InternalYjsSyncStore<Change, Checkpoint>
}): CollabStore<Change, Checkpoint> => ({
  read: () => {
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
  }
>({
  doc,
  provider,
  codec,
  origin = createCollabLocalOrigin()
}: {
  doc: Y.Doc
  provider?: CollabProvider
  codec: YjsSyncCodec<Change, Checkpoint>
  origin?: unknown
}): YjsCollabTransport<Change, Checkpoint> => {
  const syncStore = createYjsSyncStore<Change, Checkpoint>({
    doc,
    codec
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
