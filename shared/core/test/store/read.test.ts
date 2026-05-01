import { describe, expect, test } from 'vitest';
import { store } from '@shared/core';
describe('read guards', () => {
    test('throws when a derived computation calls store.get directly', () => {
        const source = store.value(1);
        const derived = store.value(() => source.get() + 1);
        expect(() => {
            derived.get();
        }).toThrow('Do not call store.get() inside a derived computation. Use read(store) instead.');
    });
});
