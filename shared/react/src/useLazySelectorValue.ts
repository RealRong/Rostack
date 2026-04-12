import { useMemo, useRef } from 'react'
import {
  createDerivedStore,
  type Equality
} from '@shared/core'
import { useStoreValue } from './useStoreValue'

type LazySelectorLeaf<T> = () => T

export type LazySelectorSource<T> = {
  [K in keyof T]:
    T[K] extends readonly unknown[]
      ? LazySelectorLeaf<T[K]>
      : T[K] extends object
        ? LazySelectorSource<T[K]> | LazySelectorLeaf<T[K]>
        : LazySelectorLeaf<T[K]>
}

export const createLazySelectorSnapshot = <T,>(
  source: LazySelectorSource<T>
): T => {
  const cache = new Map<PropertyKey, unknown>()

  return new Proxy<Record<PropertyKey, never>>({}, {
    get: (_target, property) => {
      if (cache.has(property)) {
        return cache.get(property)
      }

      const entry = (source as Record<PropertyKey, unknown>)[property]
      if (typeof entry === 'function') {
        const next = (entry as LazySelectorLeaf<unknown>)()
        cache.set(property, next)
        return next
      }

      if (entry && typeof entry === 'object') {
        const next = createLazySelectorSnapshot(
          entry as LazySelectorSource<unknown>
        )
        cache.set(property, next)
        return next
      }

      return entry
    },
    has: (_target, property) => property in source,
    ownKeys: () => Reflect.ownKeys(source),
    getOwnPropertyDescriptor: (_target, property) => (
      property in source
        ? {
            configurable: true,
            enumerable: true
          }
        : undefined
    )
  }) as T
}

export const useLazySelectorValue = <TSnapshot, TResult>(
  options: {
    source: LazySelectorSource<TSnapshot>
    selector: (snapshot: TSnapshot) => TResult
    isEqual?: Equality<TResult>
  }
): TResult => {
  const selectorRef = useRef(options.selector)
  selectorRef.current = options.selector
  const equal = options.isEqual ?? Object.is

  const store = useMemo(() => createDerivedStore<TResult>({
    get: () => selectorRef.current(createLazySelectorSnapshot(options.source)),
    isEqual: equal
  }), [equal, options.source])

  return useStoreValue(store)
}
