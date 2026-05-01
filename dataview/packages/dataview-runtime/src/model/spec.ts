import { store } from '@shared/core';
export interface ValueModelSpec<TContext, TValue> {
    kind: 'value';
    read: (context: TContext) => TValue;
    isEqual?: (left: TValue, right: TValue) => boolean;
}
export interface FamilyModelSpec<TContext, TId, TValue> {
    kind: 'family';
    ids: (context: TContext) => readonly TId[];
    read: (context: TContext, id: TId) => TValue;
    isEqual?: (left: TValue, right: TValue) => boolean;
}
export const createValueModelStore = <TContext, TValue>(context: TContext, spec: ValueModelSpec<TContext, TValue>) => store.value<TValue>(() => spec.read(context), {
    ...(spec.isEqual
        ? {
            isEqual: spec.isEqual
        }
        : {})
});
export const createFamilyModelStore = <TContext, TId, TValue>(context: TContext, spec: FamilyModelSpec<TContext, TId, TValue>) => store.keyed<TId, TValue>(id => spec.read(context, id), {
    ...(spec.isEqual
        ? {
            isEqual: spec.isEqual
        }
        : {})
});
