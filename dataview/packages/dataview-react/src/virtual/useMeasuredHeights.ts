import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react'
import { createMeasuredElementObserver } from '@shared/dom'

const DEFAULT_BUCKET_KEY = '__default__'
const EMPTY_HEIGHT_MAP = new Map<never, number>()

export interface UseMeasuredHeightsOptions<TId> {
  ids: readonly TId[]
  bucketKey?: string | number
}

export interface UseMeasuredHeightsResult<TId> {
  heightById: ReadonlyMap<TId, number>
  measure: (id: TId) => (node: HTMLElement | null) => void
}

export const useMeasuredHeights = <TId>(
  input: UseMeasuredHeightsOptions<TId>
): UseMeasuredHeightsResult<TId> => {
  const [version, bumpVersion] = useReducer((value: number) => value + 1, 0)
  const bucketKey = input.bucketKey ?? DEFAULT_BUCKET_KEY
  const bucketKeyRef = useRef<string | number>(bucketKey)
  const heightMapByBucketRef = useRef<Map<string | number, Map<TId, number>>>(new Map())
  const observedIdsRef = useRef<Set<TId>>(new Set())
  const observer = useMemo(() => createMeasuredElementObserver<TId, HTMLElement>({
    schedule: 'microtask',
    onChange: changes => {
      const resolvedBucketKey = bucketKeyRef.current
      const heightMap = heightMapByBucketRef.current.get(resolvedBucketKey) ?? new Map<TId, number>()
      let changed = false

      if (!heightMapByBucketRef.current.has(resolvedBucketKey)) {
        heightMapByBucketRef.current.set(resolvedBucketKey, heightMap)
      }

      changes.forEach(({ key: id, size }) => {
        const normalized = Math.max(1, Math.round(size.height))
        if (heightMap.get(id) === normalized) {
          return
        }

        heightMap.set(id, normalized)
        changed = true
      })

      if (changed) {
        bumpVersion()
      }
    }
  }), [])

  bucketKeyRef.current = bucketKey

  useEffect(() => {
    const activeIds = new Set(input.ids)

    heightMapByBucketRef.current.forEach(heightMap => {
      Array.from(heightMap.keys()).forEach(id => {
        if (!activeIds.has(id)) {
          heightMap.delete(id)
        }
      })
    })

    Array.from(observedIdsRef.current).forEach(id => {
      if (activeIds.has(id)) {
        return
      }

      observedIdsRef.current.delete(id)
      observer.unobserve(id)
    })
  }, [input.ids, observer])

  useEffect(() => {
    return () => {
      observedIdsRef.current.clear()
      observer.disconnect()
    }
  }, [observer])

  const measure = useCallback((id: TId) => {
    return (node: HTMLElement | null) => {
      if (!node) {
        observedIdsRef.current.delete(id)
        observer.unobserve(id)
        return
      }

      observedIdsRef.current.add(id)
      observer.observe(id, node)
    }
  }, [observer])

  const heightById = useMemo<ReadonlyMap<TId, number>>(
    () => heightMapByBucketRef.current.get(bucketKey) ?? EMPTY_HEIGHT_MAP,
    [bucketKey, version]
  )

  return {
    heightById,
    measure
  }
}
