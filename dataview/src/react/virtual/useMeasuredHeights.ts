import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from 'react'

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
  const observerRef = useRef<ResizeObserver | null>(null)
  const nodeByIdRef = useRef<Map<TId, HTMLElement>>(new Map())
  const idByNodeRef = useRef<WeakMap<HTMLElement, TId>>(new WeakMap())

  bucketKeyRef.current = bucketKey

  const updateHeight = useCallback((id: TId, height: number) => {
    const resolvedBucketKey = bucketKeyRef.current
    const normalized = Math.max(1, Math.round(height))
    const heightMap = heightMapByBucketRef.current.get(resolvedBucketKey) ?? new Map<TId, number>()
    if (!heightMapByBucketRef.current.has(resolvedBucketKey)) {
      heightMapByBucketRef.current.set(resolvedBucketKey, heightMap)
    }
    if (heightMap.get(id) === normalized) {
      return
    }

    heightMap.set(id, normalized)
    bumpVersion()
  }, [])

  useEffect(() => {
    const idSet = new Set(input.ids)

    Array.from(heightMapByBucketRef.current.values()).forEach(heightMap => {
      Array.from(heightMap.keys()).forEach(id => {
        if (!idSet.has(id)) {
          heightMap.delete(id)
        }
      })
    })

    Array.from(nodeByIdRef.current.entries()).forEach(([id, node]) => {
      if (idSet.has(id)) {
        return
      }

      observerRef.current?.unobserve(node)
      nodeByIdRef.current.delete(id)
    })
  }, [input.ids])

  useEffect(() => {
    if (typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(entries => {
        entries.forEach(entry => {
          const id = idByNodeRef.current.get(entry.target as HTMLElement)
          if (id === undefined) {
            return
          }

          updateHeight(id, entry.contentRect.height)
        })
      })
    }

    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
      nodeByIdRef.current.clear()
      idByNodeRef.current = new WeakMap()
    }
  }, [updateHeight])

  const measure = useCallback((id: TId) => {
    return (node: HTMLElement | null) => {
      const previousNode = nodeByIdRef.current.get(id)
      if (previousNode) {
        observerRef.current?.unobserve(previousNode)
        nodeByIdRef.current.delete(id)
      }

      if (!node) {
        return
      }

      updateHeight(id, node.getBoundingClientRect().height)
      nodeByIdRef.current.set(id, node)
      idByNodeRef.current.set(node, id)
      observerRef.current?.observe(node)
    }
  }, [updateHeight])

  const heightById = useMemo<ReadonlyMap<TId, number>>(
    () => heightMapByBucketRef.current.get(bucketKey) ?? EMPTY_HEIGHT_MAP,
    [bucketKey, version]
  )

  return {
    heightById,
    measure
  }
}
