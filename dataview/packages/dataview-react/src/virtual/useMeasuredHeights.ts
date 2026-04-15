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
  reactive?: boolean
  onMeasurementsChange?: (input: {
    bucketKey: string | number
    heightById: ReadonlyMap<TId, number>
  }) => void
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
  const reactive = input.reactive ?? true
  const bucketKeyRef = useRef<string | number>(bucketKey)
  const onMeasurementsChangeRef = useRef(input.onMeasurementsChange)
  const heightMapByBucketRef = useRef<Map<string | number, Map<TId, number>>>(new Map())
  const observedIdsRef = useRef<Set<TId>>(new Set())
  const measureRefByIdRef = useRef<Map<TId, (node: HTMLElement | null) => void>>(new Map())
  onMeasurementsChangeRef.current = input.onMeasurementsChange

  const emitMeasurementsChange = useCallback((resolvedBucketKey: string | number) => {
    onMeasurementsChangeRef.current?.({
      bucketKey: resolvedBucketKey,
      heightById: heightMapByBucketRef.current.get(resolvedBucketKey) ?? EMPTY_HEIGHT_MAP
    })
  }, [])
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
        if (reactive) {
          bumpVersion()
        }
        emitMeasurementsChange(resolvedBucketKey)
      }
    }
  }), [emitMeasurementsChange, reactive])

  bucketKeyRef.current = bucketKey

  useEffect(() => {
    const activeIds = new Set(input.ids)
    let currentBucketChanged = false

    heightMapByBucketRef.current.forEach(heightMap => {
      Array.from(heightMap.keys()).forEach(id => {
        if (!activeIds.has(id)) {
          if (heightMap === heightMapByBucketRef.current.get(bucketKeyRef.current)) {
            currentBucketChanged = true
          }
          heightMap.delete(id)
        }
      })
    })

    Array.from(observedIdsRef.current).forEach(id => {
      if (activeIds.has(id)) {
        return
      }

      observedIdsRef.current.delete(id)
      measureRefByIdRef.current.delete(id)
      observer.unobserve(id)
    })

    if (currentBucketChanged) {
      if (reactive) {
        bumpVersion()
      }
      emitMeasurementsChange(bucketKeyRef.current)
    }
  }, [emitMeasurementsChange, input.ids, observer, reactive])

  useEffect(() => {
    emitMeasurementsChange(bucketKey)
  }, [bucketKey, emitMeasurementsChange])

  useEffect(() => {
    return () => {
      observedIdsRef.current.clear()
      observer.disconnect()
    }
  }, [observer])

  const measure = useCallback((id: TId) => {
    const cached = measureRefByIdRef.current.get(id)
    if (cached) {
      return cached
    }

    const ref = (node: HTMLElement | null) => {
      if (!node) {
        observedIdsRef.current.delete(id)
        observer.unobserve(id)
        return
      }

      observedIdsRef.current.add(id)
      observer.observe(id, node)
    }
    measureRefByIdRef.current.set(id, ref)
    return ref
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
