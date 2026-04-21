import type { Equality } from '../equality'
import {
  batch,
  enqueueRoot,
  queueListeners
} from './batch'
import {
  collectDependencies,
  reconcileDependencies,
  subscribeTrackedDependency,
  type DependencyRecord
} from './deps'
import {
  notifyListeners
} from './listeners'
import {
  guardPlainGet
} from './read'
import {
  INTERNAL_SUBSCRIBE,
  type InternalReadStore,
  type RuntimeRoot
} from './runtime'
import type {
  Listener,
  ReadStore,
  Unsubscribe
} from './types'

const sameValue = <T,>(
  left: T,
  right: T
) => Object.is(left, right)

type NodeState = 'dirty' | 'clean' | 'computing'

export interface DerivedNode<T> extends InternalReadStore<T>, RuntimeRoot {
  subscriberCount(): number
  dispose(): void
}

export const createDerivedNode = <T,>(
  options: {
    get: () => T
    isEqual?: Equality<T>
    onIdle?: () => void
  }
): DerivedNode<T> => {
  const token = {}
  const isEqual = options.isEqual ?? sameValue
  const publicListeners = new Set<Listener>()
  const internalListeners = new Set<Listener>()
  let current: T | undefined
  let hasCurrent = false
  let state: NodeState = 'dirty'
  let dependencies: readonly DependencyRecord[] = []
  let unsubscribeDependencies: Unsubscribe = () => {}

  const totalSubscribers = () => publicListeners.size + internalListeners.size

  const cleanupDependencies = () => {
    unsubscribeDependencies()
    unsubscribeDependencies = () => {}
    dependencies = []
    state = 'dirty'
  }

  const onDependencyChange = () => {
    if (state === 'dirty') {
      return
    }

    state = 'dirty'
    if (totalSubscribers() > 0) {
      enqueueRoot(node)
    }
  }

  const ensureFresh = (
    notify: boolean
  ): T => {
    if (state === 'clean' && hasCurrent) {
      return current as T
    }

    if (state === 'computing') {
      throw new Error('Circular derived store dependency detected.')
    }

    state = 'computing'
    try {
      const computed = collectDependencies(token, options.get)
      const nextDependencies = reconcileDependencies({
        previous: dependencies,
        next: computed.dependencies,
        subscribe: dependency => subscribeTrackedDependency(
          dependency,
          onDependencyChange
        )
      })
      const previous = current as T
      const changed = !hasCurrent || !isEqual(previous, computed.value)

      dependencies = nextDependencies
      unsubscribeDependencies = () => {
        nextDependencies.forEach(dependency => {
          dependency.unsubscribe()
        })
      }
      if (changed) {
        current = computed.value
      }
      hasCurrent = true
      state = 'clean'

      if (changed && notify) {
        batch(() => {
          notifyListeners(internalListeners)
          queueListeners(publicListeners)
        })
      }

      return current as T
    } catch (error) {
      state = 'dirty'
      throw error
    }
  }

  const subscribeListeners = (
    listeners: Set<Listener>,
    listener: Listener
  ) => {
    const wasIdle = totalSubscribers() === 0
    listeners.add(listener)

    if (wasIdle) {
      ensureFresh(false)
    }

    return () => {
      listeners.delete(listener)
      if (totalSubscribers() > 0) {
        return
      }

      cleanupDependencies()
      options.onIdle?.()
    }
  }

  const node: DerivedNode<T> = {
    get: guardPlainGet(() => ensureFresh(false)),
    subscribe: listener => subscribeListeners(publicListeners, listener),
    [INTERNAL_SUBSCRIBE]: (listener: Listener) => subscribeListeners(internalListeners, listener),
    subscriberCount: totalSubscribers,
    hasSubscribers: () => totalSubscribers() > 0,
    refresh: (notify) => {
      ensureFresh(notify)
    },
    dispose: cleanupDependencies,
    isEqual
  }

  return node
}

export const createDerivedStore = <T,>(
  options: {
    get: () => T
    isEqual?: Equality<T>
  }
): ReadStore<T> => createDerivedNode(options)
