import { useCallback, useRef, useSyncExternalStore } from 'react'

export const useExternalValue = <T,>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  equal: (left: T, right: T) => boolean
): T => {
  const cacheRef = useRef<{ value: T } | undefined>(undefined)
  const revisionRef = useRef(0)

  const readValue = useCallback(() => {
    // Selector-style hooks may project a fresh but equal value from a stable source snapshot.
    // We keep a semantic cache here so projection hooks can stay referentially stable.
    const next = getSnapshot()
    const cached = cacheRef.current

    if (cached && equal(cached.value, next)) {
      return cached.value
    }

    cacheRef.current = { value: next }
    return next
  }, [equal, getSnapshot])

  const subscribeRevision = useCallback((listener: () => void) => subscribe(() => {
    const previous = cacheRef.current?.value
    const next = getSnapshot()

    if (previous !== undefined && equal(previous, next)) {
      cacheRef.current = { value: previous }
      return
    }

    cacheRef.current = { value: next }
    revisionRef.current += 1
    listener()
  }), [equal, getSnapshot, subscribe])

  useSyncExternalStore(
    subscribeRevision,
    () => revisionRef.current,
    () => revisionRef.current
  )

  return readValue()
}
