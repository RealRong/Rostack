import type {
  Listener,
  Unsubscribe
} from './types'

export const notifyListeners = (
  listeners: Iterable<Listener>
) => {
  Array.from(listeners).forEach(listener => {
    listener()
  })
}

export const joinUnsubscribes = (
  unsubscribes: readonly Unsubscribe[]
): Unsubscribe => () => {
  unsubscribes.forEach(unsubscribe => unsubscribe())
}
