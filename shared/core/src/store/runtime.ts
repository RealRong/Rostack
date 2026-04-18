import type {
  KeyedReadStore,
  Listener,
  ReadStore,
  Unsubscribe
} from './types'

export const INTERNAL_SUBSCRIBE = Symbol('shared-core-store-internal-subscribe')
export const INTERNAL_KEYED_SUBSCRIBE = Symbol('shared-core-store-internal-keyed-subscribe')

export interface RuntimeRoot {
  hasSubscribers(): boolean
  refresh(notify: boolean): void
}

export type TrackDependency = (
  store: unknown,
  key: unknown
) => void

export interface ComputationFrame {
  token: object
  track: TrackDependency | null
  parent: ComputationFrame | null
}

export interface StoreRuntime {
  batchDepth: number
  flushing: boolean
  revision: number
  activeFrame: ComputationFrame | null
  pendingRoots: Set<RuntimeRoot>
  pendingListeners: Set<Listener>
}

const runtime: StoreRuntime = {
  batchDepth: 0,
  flushing: false,
  revision: 0,
  activeFrame: null,
  pendingRoots: new Set(),
  pendingListeners: new Set()
}

export const getStoreRuntime = (): StoreRuntime => runtime

export const beginComputation = (
  token: object,
  track: TrackDependency | null
): ComputationFrame => {
  let current = runtime.activeFrame
  while (current) {
    if (current.token === token) {
      throw new Error('Circular derived store dependency detected.')
    }
    current = current.parent
  }

  const frame: ComputationFrame = {
    token,
    track,
    parent: runtime.activeFrame
  }
  runtime.activeFrame = frame
  return frame
}

export const endComputation = (
  frame: ComputationFrame
) => {
  if (runtime.activeFrame === frame) {
    runtime.activeFrame = frame.parent
    return
  }

  runtime.activeFrame = frame.parent
}

export interface InternalReadSubscription<T> {
  [INTERNAL_SUBSCRIBE]?: (listener: Listener) => Unsubscribe
}

export interface InternalKeyedReadSubscription<K, T> {
  [INTERNAL_KEYED_SUBSCRIBE]?: (key: K, listener: Listener) => Unsubscribe
}

export type InternalReadStore<T> = ReadStore<T> & InternalReadSubscription<T>

export type InternalKeyedReadStore<K, T> = KeyedReadStore<K, T> & InternalKeyedReadSubscription<K, T>
