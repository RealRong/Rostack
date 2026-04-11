import { createValueStore } from '@shared/core'
import type { Commit } from '@whiteboard/engine'
import * as Y from 'yjs'
import type {
  CollabBootstrapMode,
  CollabStatus,
  CollabSession,
  CreateYjsSessionOptions
} from './types'
import { applyOperationsToYjsDocument } from './yjs/apply'
import {
  hasYjsDocumentSnapshot,
  materializeYjsDocument,
  replaceYjsDocument
} from './yjs/materialize'
import { compileRemoteDocumentChange } from './yjs/diff'

const resolveBootstrapMode = (
  mode: CollabBootstrapMode,
  doc: Y.Doc
): Exclude<CollabBootstrapMode, 'auto'> => {
  if (mode === 'engine-first' || mode === 'yjs-first') {
    return mode
  }

  return hasYjsDocumentSnapshot(doc)
    ? 'yjs-first'
    : 'engine-first'
}

export const createYjsSession = ({
  engine,
  doc,
  provider,
  bootstrap = 'auto'
}: CreateYjsSessionOptions): CollabSession => {
  const status = createValueStore<CollabStatus>('idle')
  const localOrigin = {
    source: '@whiteboard/collab'
  } as const
  let destroyed = false
  let bootstrapped = false
  let waitingForProviderSync = false
  let suppressLocalMirror = false
  let lastCommit: Commit | null = null
  let unsubscribeProviderSync: (() => void) | undefined

  const reportError = () => {
    status.set('error')
  }

  const syncCommitToYDoc = (commit: Commit) => {
    if (suppressLocalMirror) {
      return
    }
    if (commit.changes.origin === 'remote') {
      return
    }

    doc.transact(() => {
      if (commit.kind === 'replace') {
        replaceYjsDocument(doc, commit.document)
        return
      }

      applyOperationsToYjsDocument({
        doc,
        operations: commit.changes.operations,
        snapshot: commit.document
      })
    }, localOrigin)
  }

  const applyRemoteYDocChange = () => {
    const nextDocument = materializeYjsDocument(doc)
    if (!nextDocument) {
      return
    }

    const current = engine.document.get()
    const change = compileRemoteDocumentChange(current, nextDocument)
    if (change.kind === 'replace') {
      suppressLocalMirror = true
      try {
        engine.execute({
          type: 'document.replace',
          document: change.document
        })
      } finally {
        suppressLocalMirror = false
      }
      return
    }

    if (change.operations.length === 0) {
      return
    }

    engine.applyOperations(change.operations, {
      origin: 'remote'
    })
  }

  const commitUnsubscribe = engine.commit.subscribe(() => {
    const nextCommit = engine.commit.get()
    if (!nextCommit || nextCommit === lastCommit) {
      return
    }
    lastCommit = nextCommit

    if (!bootstrapped || destroyed) {
      return
    }

    try {
      syncCommitToYDoc(nextCommit)
    } catch {
      reportError()
    }
  })

  const handleAfterTransaction = (transaction: Y.Transaction) => {
    if (!bootstrapped || destroyed) {
      return
    }
    if (transaction.origin === localOrigin) {
      return
    }

    try {
      applyRemoteYDocChange()
    } catch {
      reportError()
    }
  }

  doc.on('afterTransaction', handleAfterTransaction)

  const finalizeBootstrap = (
    mode: Exclude<CollabBootstrapMode, 'auto'>
  ) => {
    if (mode === 'engine-first') {
      doc.transact(() => {
        replaceYjsDocument(doc, engine.document.get())
      }, localOrigin)
      bootstrapped = true
      status.set('connected')
      return
    }

    const snapshot = materializeYjsDocument(doc)
    if (!snapshot) {
      throw new Error('Cannot bootstrap from an empty Yjs document.')
    }

    suppressLocalMirror = true
    try {
      engine.execute({
        type: 'document.replace',
        document: snapshot
      })
    } finally {
      suppressLocalMirror = false
    }
    bootstrapped = true
    status.set('connected')
  }

  const runBootstrap = (
    mode: CollabBootstrapMode = bootstrap
  ) => {
    if (destroyed) {
      return
    }

    status.set('bootstrapping')
    const resolved = resolveBootstrapMode(mode, doc)
    finalizeBootstrap(resolved)
  }

  const safeBootstrap = (
    mode: CollabBootstrapMode = bootstrap
  ) => {
    try {
      runBootstrap(mode)
    } catch {
      reportError()
    }
  }

  const maybeWaitForProviderSync = (
    mode: CollabBootstrapMode
  ) => {
    if (mode === 'engine-first') {
      safeBootstrap(mode)
      return
    }

    const synced = provider?.isSynced?.()
    if (synced === true) {
      safeBootstrap(mode)
      return
    }

    if (!provider?.subscribeSync) {
      safeBootstrap(mode)
      return
    }

    waitingForProviderSync = true
    status.set('connecting')
    unsubscribeProviderSync?.()
    unsubscribeProviderSync = provider.subscribeSync((nextSynced) => {
      if (!nextSynced || destroyed) {
        return
      }
      waitingForProviderSync = false
      unsubscribeProviderSync?.()
      unsubscribeProviderSync = undefined
      safeBootstrap(mode)
    })
  }

  const connect = () => {
    if (destroyed) {
      return
    }

    provider?.connect?.()

    if (bootstrapped) {
      status.set('connected')
      return
    }

    maybeWaitForProviderSync(bootstrap)
  }

  const disconnect = () => {
    if (destroyed) {
      return
    }

    provider?.disconnect?.()
    if (waitingForProviderSync) {
      unsubscribeProviderSync?.()
      unsubscribeProviderSync = undefined
      waitingForProviderSync = false
    }
    status.set('disconnected')
  }

  const resync = (
    mode: CollabBootstrapMode = bootstrap
  ) => {
    if (destroyed) {
      return
    }

    if (waitingForProviderSync) {
      unsubscribeProviderSync?.()
      unsubscribeProviderSync = undefined
      waitingForProviderSync = false
    }

    safeBootstrap(mode)
  }

  const destroy = () => {
    if (destroyed) {
      return
    }
    destroyed = true
    unsubscribeProviderSync?.()
    unsubscribeProviderSync = undefined
    provider?.destroy?.()
    doc.off('afterTransaction', handleAfterTransaction)
    commitUnsubscribe()
    waitingForProviderSync = false
    status.set('disconnected')
  }

  return {
    awareness: provider?.awareness,
    status,
    connect,
    disconnect,
    resync,
    destroy
  }
}
