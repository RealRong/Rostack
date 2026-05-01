import { useMemo, useRef } from 'react';
import { equal, store as coreStore } from '@shared/core';
import { useStoreValue } from '@shared/react/useStoreValue';
type LazySelectorLeaf<T> = () => T;
export type LazySelectorSource<T> = {
    [K in keyof T]: T[K] extends readonly unknown[] ? LazySelectorLeaf<T[K]> : T[K] extends object ? LazySelectorSource<T[K]> | LazySelectorLeaf<T[K]> : LazySelectorLeaf<T[K]>;
};
export const createLazySelectorSnapshot = <T,>(source: LazySelectorSource<T>): T => {
    const cache = new Map<PropertyKey, unknown>();
    return new Proxy<Record<PropertyKey, never>>({}, {
        get: (_target, property) => {
            if (cache.has(property)) {
                return cache.get(property);
            }
            const entry = (source as Record<PropertyKey, unknown>)[property];
            if (typeof entry === 'function') {
                const next = (entry as LazySelectorLeaf<unknown>)();
                cache.set(property, next);
                return next;
            }
            if (entry && typeof entry === 'object') {
                const next = createLazySelectorSnapshot(entry as LazySelectorSource<unknown>);
                cache.set(property, next);
                return next;
            }
            return entry;
        },
        has: (_target, property) => property in source,
        ownKeys: () => Reflect.ownKeys(source),
        getOwnPropertyDescriptor: (_target, property) => (property in source
            ? {
                configurable: true,
                enumerable: true
            }
            : undefined)
    }) as T;
};
export const useLazySelectorValue = <TSnapshot, TResult>(options: {
    source: LazySelectorSource<TSnapshot>;
    selector: (snapshot: TSnapshot) => TResult;
    isEqual?: equal.Equality<TResult>;
}): TResult => {
    const selectorRef = useRef(options.selector);
    selectorRef.current = options.selector;
    const isEqual = options.isEqual ?? Object.is;
    const valueStore = useMemo(() => coreStore.value<TResult>(() => selectorRef.current(createLazySelectorSnapshot(options.source)), {
        isEqual
    }), [isEqual, options.source]);
    return useStoreValue(valueStore);
};
