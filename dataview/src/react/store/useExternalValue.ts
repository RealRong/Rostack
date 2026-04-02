import { useCallback, useRef, useSyncExternalStore } from 'react'

export const useExternalValue = <T,>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  equal: (left: T, right: T) => boolean
): T => {
  const cacheRef = useRef<{ value: T } | undefined>(undefined)
  const getCachedSnapshot = useCallback(() => {
    const next = getSnapshot()
    const cached = cacheRef.current

    if (cached && equal(cached.value, next)) {
      return cached.value
    }

    cacheRef.current = { value: next }
    return next
  }, [equal, getSnapshot])

  return useSyncExternalStore(subscribe, getCachedSnapshot, getCachedSnapshot)
}
