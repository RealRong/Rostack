import { store } from '@shared/core';
import type { ItemId } from '@dataview/engine';
export interface TableRailRuntime {
    active: store.ReadStore<ItemId | null>;
    row: store.KeyedReadStore<ItemId, boolean>;
    set: (rowId: ItemId | null) => void;
}
export const createTableRailRuntime = (): TableRailRuntime => {
    const active = store.value<ItemId | null>(null, {
        isEqual: Object.is
    });
    return {
        active,
        row: store.keyed<ItemId, boolean>(rowId => store.read(active) === rowId, {
            keyOf: rowId => rowId,
            isEqual: Object.is
        }),
        set: active.set
    };
};
