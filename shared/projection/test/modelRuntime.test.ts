import { store } from '../../core/src/index.ts';
import { expect, it } from 'vitest';
import type { ProjectionFamilyChange, ProjectionFamilySnapshot } from '../src';
import { createProjection } from '../src';
type Item = {
    id: string;
    value: number;
};
type Input = {
    delta: TestDelta;
    items: readonly Item[];
};
type State = {
    items: Map<string, Item>;
    change: ProjectionFamilyChange<string, Item>;
};
type TestDeltaChanges = Readonly<Record<string, {
    ids?: readonly string[] | 'all';
}>>;
type TestDelta = {
    byKey: TestDeltaChanges;
    reset(): boolean;
};
const EMPTY_CHANGES: TestDeltaChanges = Object.freeze(Object.create(null));
const hasChange = (delta: TestDelta, key: string): boolean => (delta.reset()
    || Object.prototype.hasOwnProperty.call(delta.byKey, key));
const readIds = (delta: TestDelta, key: string): readonly string[] | 'all' | undefined => (delta.reset()
    ? 'all'
    : delta.byKey[key]?.ids);
const toSnapshot = (items: Map<string, Item>): ProjectionFamilySnapshot<string, Item> => ({
    ids: [...items.keys()],
    byId: items
});
const buildItemChange = (input: {
    delta: TestDelta;
    snapshot: ProjectionFamilySnapshot<string, Item>;
}): ProjectionFamilyChange<string, Item> => {
    if (input.delta.reset()) {
        return 'replace';
    }
    const written = readIds(input.delta, 'items.write');
    const removed = readIds(input.delta, 'items.remove');
    if (written === 'all' || removed === 'all') {
        return 'replace';
    }
    const nextSet = new Set(written ?? []);
    (removed ?? []).forEach((id) => {
        nextSet.delete(id);
    });
    if (nextSet.size === 0
        && (removed?.length ?? 0) === 0
        && !hasChange(input.delta, 'items.order')) {
        return 'skip';
    }
    const set = [...nextSet].map((id) => {
        const value = input.snapshot.byId.get(id);
        if (value === undefined) {
            throw new Error(`Missing item snapshot for ${id}.`);
        }
        return [id, value] as const;
    });
    return {
        ...(hasChange(input.delta, 'items.order')
            ? {
                ids: input.snapshot.ids
            }
            : {}),
        ...(set.length > 0
            ? {
                set
            }
            : {}),
        ...(removed?.length
            ? {
                remove: removed
            }
            : {})
    };
};
const createDelta = (changes: TestDeltaChanges = EMPTY_CHANGES): TestDelta => ({
    byKey: changes,
    reset: () => false
});
it('projection runtime exposes capture and keyed family subscriptions', () => {
    const runtime = createProjection<Input, State, {}, {
        revision: number;
        count: number;
    }, 'items', {
        items: {
            kind: 'family';
            read(state: State): ProjectionFamilySnapshot<string, Item>;
            change(state: State): ProjectionFamilyChange<string, Item>;
        };
    }>({
        createState: () => ({
            items: new Map<string, Item>(),
            change: 'skip'
        }),
        createRead: () => ({}),
        capture: ({ state, revision }) => ({
            revision,
            count: state.items.size
        }),
        stores: {
            items: {
                kind: 'family',
                read: (state) => toSnapshot(state.items),
                change: (state) => state.change
            }
        },
        phases: {
            items: (ctx) => {
                ctx.state.items = new Map(ctx.input.items.map((item) => [item.id, item] as const));
                ctx.state.change = buildItemChange({
                    delta: ctx.input.delta,
                    snapshot: toSnapshot(ctx.state.items)
                });
                ctx.phase.items.changed = ctx.state.change !== 'skip';
            }
        }
    });
    const projected = store.keyed<string, number | undefined>((id) => store.read(runtime.stores.items.byId, id)?.value);
    expect(projected.get('a')).toBeUndefined();
    expect(runtime.capture()).toEqual({
        revision: 0,
        count: 0
    });
    const first = runtime.update({
        delta: createDelta({
            'items.write': {
                ids: ['a']
            }
        }),
        items: [{
                id: 'a',
                value: 1
            }]
    });
    expect(projected.get('a')).toBe(1);
    expect(first.capture).toEqual({
        revision: 1,
        count: 1
    });
    expect(runtime.capture()).toEqual(first.capture);
    runtime.update({
        delta: createDelta({
            'items.write': {
                ids: ['a']
            }
        }),
        items: [{
                id: 'a',
                value: 2
            }]
    });
    expect(projected.get('a')).toBe(2);
    expect(runtime.capture()).toEqual({
        revision: 2,
        count: 1
    });
});
