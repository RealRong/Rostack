import type {
  WhiteboardCollabOptions,
  WhiteboardPresenceBinding,
  WhiteboardPresenceState
} from '@whiteboard/react'
import * as Y from 'yjs'

const CHANNEL_PREFIX = 'whiteboard-demo-room'
const REMOTE_DOC_ORIGIN = {
  source: '@whiteboard/demo/broadcast'
} as const
const SYNC_TIMEOUT_MS = 180
const STALE_PRESENCE_MS = 12_000
const PRESENCE_SWEEP_MS = 3_000
const USER_COLORS = [
  '#0f766e',
  '#ea580c',
  '#1d4ed8',
  '#a21caf',
  '#b91c1c',
  '#0369a1',
  '#4d7c0f',
  '#c2410c'
] as const

type SyncRequestMessage = {
  type: 'sync-request'
  from: string
  stateVector: Uint8Array
}

type SyncResponseMessage = {
  type: 'sync-response'
  from: string
  target: string
  update: Uint8Array
}

type DocUpdateMessage = {
  type: 'doc-update'
  from: string
  update: Uint8Array
}

type AwarenessUpdateMessage = {
  type: 'awareness-update'
  from: string
  state: DemoPresenceState | null
}

type DemoMessage =
  | SyncRequestMessage
  | SyncResponseMessage
  | DocUpdateMessage
  | AwarenessUpdateMessage

export type DemoUser = {
  id: string
  name: string
  color: string
}

export type DemoPresenceState = WhiteboardPresenceState

export type DemoAwareness = WhiteboardPresenceBinding

type DemoCollabBinding = {
  doc: Y.Doc
  provider: NonNullable<WhiteboardCollabOptions['provider']>
  awareness: DemoAwareness
  destroy: () => void
}

const clonePresenceState = (
  state: DemoPresenceState | null
): DemoPresenceState | null => {
  if (!state) {
    return null
  }

  return {
    user: {
      ...state.user
    },
    pointer: state.pointer
      ? {
          world: {
            ...state.pointer.world
          },
          timestamp: state.pointer.timestamp
        }
      : undefined,
    selection: state.selection
      ? {
          nodeIds: [...state.selection.nodeIds],
          edgeIds: [...state.selection.edgeIds]
        }
      : undefined,
    tool: state.tool
      ? {
          ...state.tool
        }
      : undefined,
    activity: state.activity,
    updatedAt: state.updatedAt
  }
}

class DemoAwarenessStore implements DemoAwareness {
  readonly clientId: string
  readonly user: DemoUser

  private localState: DemoPresenceState | null
  private states: Map<string, DemoPresenceState>
  private listeners = new Set<() => void>()
  private onLocalChange: () => void

  constructor({
    clientId,
    user,
    onLocalChange
  }: {
    clientId: string
    user: DemoUser
    onLocalChange: () => void
  }) {
    this.clientId = clientId
    this.user = user
    this.onLocalChange = onLocalChange
    this.localState = {
      user,
      activity: 'idle',
      updatedAt: Date.now()
    }
    this.states = new Map([
      [
        clientId,
        clonePresenceState(this.localState)!
      ]
    ])
  }

  getLocalState = () => clonePresenceState(this.localState)

  getStates = () => new Map(
    Array.from(this.states.entries(), ([key, value]) => [
      key,
      clonePresenceState(value)!
    ])
  )

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setLocalState = (state: DemoPresenceState | null) => {
    this.localState = state
      ? {
          ...clonePresenceState(state)!,
          user: this.user,
          updatedAt: Date.now()
        }
      : null
    if (this.localState) {
      this.states.set(this.clientId, clonePresenceState(this.localState)!)
    } else {
      this.states.delete(this.clientId)
    }
    this.emit()
    this.onLocalChange()
  }

  updateLocalState = (
    recipe: (prev: DemoPresenceState | null) => DemoPresenceState | null
  ) => {
    this.setLocalState(recipe(this.getLocalState()))
  }

  applyRemoteState = (
    clientId: string,
    state: DemoPresenceState | null
  ) => {
    if (clientId === this.clientId) {
      return
    }
    if (!state) {
      this.removeRemoteState(clientId)
      return
    }
    this.states.set(clientId, {
      ...clonePresenceState(state)!,
      updatedAt: Date.now()
    })
    this.emit()
  }

  removeRemoteState = (clientId: string) => {
    if (clientId === this.clientId) {
      return
    }
    if (!this.states.delete(clientId)) {
      return
    }
    this.emit()
  }

  clearRemoteStates = () => {
    let changed = false
    Array.from(this.states.keys()).forEach((clientId) => {
      if (clientId === this.clientId) {
        return
      }
      changed = this.states.delete(clientId) || changed
    })
    if (changed) {
      this.emit()
    }
  }

  sweepExpiredStates = (maxAgeMs: number) => {
    const now = Date.now()
    let changed = false
    Array.from(this.states.entries()).forEach(([clientId, state]) => {
      if (clientId === this.clientId) {
        return
      }
      if (now - state.updatedAt <= maxAgeMs) {
        return
      }
      changed = this.states.delete(clientId) || changed
    })
    if (changed) {
      this.emit()
    }
  }

  private emit = () => {
    Array.from(this.listeners).forEach((listener) => {
      listener()
    })
  }
}

const hashString = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

const readSessionStorage = (
  key: string
) => {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const writeSessionStorage = (
  key: string,
  value: string
) => {
  if (typeof window === 'undefined') {
    return
  }
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    // ignore storage failures
  }
}

export const createDemoUser = (): DemoUser => {
  const storageKey = 'whiteboard-demo-user'
  const cached = readSessionStorage(storageKey)
  if (cached) {
    try {
      return JSON.parse(cached) as DemoUser
    } catch {
      // ignore parse failures
    }
  }

  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `demo-${Math.random().toString(36).slice(2, 10)}`
  const shortId = id.slice(0, 4).toUpperCase()
  const color = USER_COLORS[hashString(id) % USER_COLORS.length]
  const user = {
    id,
    name: `访客 ${shortId}`,
    color
  }
  writeSessionStorage(storageKey, JSON.stringify(user))
  return user
}

const createChannelName = (roomId: string) =>
  `${CHANNEL_PREFIX}:${roomId}`

export const readRoomIdFromUrl = (
  defaultRoomId = 'playground'
) => {
  if (typeof window === 'undefined') {
    return normalizeRoomId(defaultRoomId)
  }
  const params = new URLSearchParams(window.location.search)
  return normalizeRoomId(params.get('room') ?? defaultRoomId)
}

export const buildRoomUrl = (roomId: string) => {
  if (typeof window === 'undefined') {
    return `?room=${encodeURIComponent(roomId)}`
  }
  const url = new URL(window.location.href)
  url.searchParams.set('room', roomId)
  return url.toString()
}

export const normalizeRoomId = (
  value: string
) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'playground'
}

export const createBroadcastChannelCollab = ({
  roomId,
  user
}: {
  roomId: string
  user: DemoUser
}): DemoCollabBinding => {
  const doc = new Y.Doc()
  let channel: BroadcastChannel | null = null
  let connected = false
  let synced = false
  let syncTimer: number | null = null
  let sweepTimer: number | null = null
  const syncListeners = new Set<(synced: boolean) => void>()

  const setSynced = (next: boolean) => {
    if (synced === next) {
      return
    }
    synced = next
    Array.from(syncListeners).forEach((listener) => {
      listener(next)
    })
  }

  const publishMessage = (message: DemoMessage) => {
    channel?.postMessage(message)
  }

  const awareness = new DemoAwarenessStore({
    clientId: user.id,
    user,
    onLocalChange: () => {
      if (!connected) {
        return
      }
      publishMessage({
        type: 'awareness-update',
        from: user.id,
        state: awareness.getLocalState()
      })
    }
  })

  const clearSyncTimer = () => {
    if (syncTimer == null) {
      return
    }
    window.clearTimeout(syncTimer)
    syncTimer = null
  }

  const finishSyncSoon = () => {
    clearSyncTimer()
    syncTimer = window.setTimeout(() => {
      setSynced(true)
    }, SYNC_TIMEOUT_MS)
  }

  const handleDocUpdate = (
    update: Uint8Array,
    origin: unknown
  ) => {
    if (!connected || origin === REMOTE_DOC_ORIGIN) {
      return
    }
    publishMessage({
      type: 'doc-update',
      from: user.id,
      update
    })
  }

  const handleMessage = (
    event: MessageEvent<DemoMessage>
  ) => {
    const message = event.data
    if (!message || message.from === user.id) {
      return
    }

    switch (message.type) {
      case 'sync-request':
        publishMessage({
          type: 'sync-response',
          from: user.id,
          target: message.from,
          update: Y.encodeStateAsUpdate(doc, message.stateVector)
        })
        publishMessage({
          type: 'awareness-update',
          from: user.id,
          state: awareness.getLocalState()
        })
        return
      case 'sync-response':
        if (message.target !== user.id) {
          return
        }
        Y.applyUpdate(doc, message.update, REMOTE_DOC_ORIGIN)
        clearSyncTimer()
        setSynced(true)
        return
      case 'doc-update':
        Y.applyUpdate(doc, message.update, REMOTE_DOC_ORIGIN)
        return
      case 'awareness-update':
        awareness.applyRemoteState(message.from, message.state)
        return
    }
  }

  const disconnect = () => {
    if (!connected) {
      return
    }
    publishMessage({
      type: 'awareness-update',
      from: user.id,
      state: null
    })
    connected = false
    clearSyncTimer()
    if (sweepTimer != null) {
      window.clearInterval(sweepTimer)
      sweepTimer = null
    }
    doc.off('update', handleDocUpdate)
    awareness.clearRemoteStates()
    channel?.close()
    channel = null
    setSynced(false)
  }

  const connect = () => {
    if (connected) {
      return
    }
    if (typeof BroadcastChannel === 'undefined') {
      throw new Error('BroadcastChannel is not supported in this browser.')
    }

    connected = true
    setSynced(false)
    channel = new BroadcastChannel(createChannelName(roomId))
    channel.onmessage = handleMessage
    doc.on('update', handleDocUpdate)
    sweepTimer = window.setInterval(() => {
      awareness.sweepExpiredStates(STALE_PRESENCE_MS)
    }, PRESENCE_SWEEP_MS)

    publishMessage({
      type: 'awareness-update',
      from: user.id,
      state: awareness.getLocalState()
    })
    publishMessage({
      type: 'sync-request',
      from: user.id,
      stateVector: Y.encodeStateVector(doc)
    })
    finishSyncSoon()
  }

  return {
    doc,
    awareness,
    provider: {
      connect,
      disconnect,
      destroy: () => {
        disconnect()
      },
      isSynced: () => synced,
      subscribeSync: (listener) => {
        syncListeners.add(listener)
        return () => {
          syncListeners.delete(listener)
        }
      },
      awareness
    },
    destroy: () => {
      disconnect()
      doc.destroy()
    }
  }
}
