export type CollabStatus =
  | 'idle'
  | 'connecting'
  | 'bootstrapping'
  | 'connected'
  | 'disconnected'
  | 'error'

export type CollabBootstrapMode =
  | 'auto'
  | 'engine-first'
  | 'yjs-first'

export type CollabProvider = {
  connect?: () => void
  disconnect?: () => void
  destroy?: () => void
  isSynced?: () => boolean
  subscribeSync?: (listener: (synced: boolean) => void) => (() => void)
  awareness?: unknown
}
