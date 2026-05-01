import { describe, expect, test, vi } from 'vitest';
import { store } from '@shared/core';
describe('createKeyedDerivedStore', () => {
    test('keeps keyed snapshots stable when recompute stays equal and still refreshes dependencies', () => {
        const active = store.value<'left' | 'right'>('left');
        const leftSource = store.value(new Map([
            ['row', { count: 1 }]
        ]));
        const rightSource = store.value(new Map([
            ['row', { count: 1 }]
        ]));
        const emptyValue = {
            count: 0
        };
        const family = store.keyed((key: {
            id: string;
        }) => store.read(active) === 'left'
            ? store.read(leftSource).get(key.id) ?? emptyValue
            : store.read(rightSource).get(key.id) ?? emptyValue, {
            keyOf: key => key.id,
            isEqual: (previous, next) => previous.count === next.count
        });
        const row = {
            id: 'row'
        };
        const first = family.get(row);
        const values: Array<{
            count: number;
        }> = [];
        const unsubscribe = family.subscribe(row, () => {
            values.push(family.get(row));
        });
        active.set('right');
        expect(family.get(row)).toBe(first);
        expect(values).toEqual([]);
        leftSource.set(new Map([
            ['row', { count: 2 }]
        ]));
        expect(family.get(row)).toBe(first);
        expect(values).toEqual([]);
        rightSource.set(new Map([
            ['row', { count: 2 }]
        ]));
        expect(values).toHaveLength(1);
        expect(values[0]).toBe(family.get(row));
        expect(family.get(row)).not.toBe(first);
        expect(family.get(row).count).toBe(2);
        unsubscribe();
    });
    test('continues to work after idle eviction when using keyOf', () => {
        const source = store.value(new Map([
            ['left', 1],
            ['right', 2],
            ['extra', 3]
        ]));
        const family = store.keyed((key: {
            id: string;
        }) => store.read(source).get(key.id) ?? 0, {
            keyOf: key => key.id
        });
        const left = {
            id: 'left'
        };
        const values: number[] = [];
        const unsubscribe = family.subscribe(left, () => {
            values.push(family.get(left));
        });
        source.set(new Map([
            ['left', 4],
            ['right', 2],
            ['extra', 3]
        ]));
        expect(values).toEqual([4]);
        unsubscribe();
        family.get({
            id: 'right'
        });
        family.get({
            id: 'extra'
        });
        expect(family.get({
            id: 'left'
        })).toBe(4);
    });
    test('schedules idle cleanup asynchronously and keeps a key alive when it is read again before cleanup', () => {
        const queuedTasks: Array<() => void> = [];
        const queueMicrotaskSpy = vi
            .spyOn(globalThis, 'queueMicrotask')
            .mockImplementation(task => {
            queuedTasks.push(task);
        });
        try {
            let dependencySubscribers = 0;
            const source = store.value({
                get: () => 7,
                subscribe: () => {
                    dependencySubscribers += 1;
                    return () => {
                        dependencySubscribers -= 1;
                    };
                }
            });
            let getCalls = 0;
            const family = store.keyed((key: {
                id: string;
            }) => {
                getCalls += 1;
                return store.read(source) + key.id.length;
            }, {
                keyOf: key => key.id
            });
            const left = {
                id: 'left'
            };
            const unsubscribe = family.subscribe(left, () => { });
            expect(getCalls).toBe(1);
            expect(dependencySubscribers).toBe(1);
            unsubscribe();
            expect(dependencySubscribers).toBe(0);
            expect(queueMicrotaskSpy).toHaveBeenCalledTimes(1);
            expect(queuedTasks).toHaveLength(1);
            expect(family.get(left)).toBe(11);
            expect(getCalls).toBe(2);
            expect(dependencySubscribers).toBe(1);
            queuedTasks[0]();
            expect(dependencySubscribers).toBe(1);
            expect(family.get(left)).toBe(11);
            expect(getCalls).toBe(2);
        }
        finally {
            queueMicrotaskSpy.mockRestore();
        }
    });
});
