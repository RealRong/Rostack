import { store } from '@shared/core';
import type { CellRef, ItemId, ItemList } from '@dataview/engine';
import { gridSelection, type GridSelection } from '@dataview/table';
import type { GridSelectionEdges } from '@dataview/table/gridSelection';
import { cellId, type CellId } from '@dataview/runtime';
import type { TableDisplayedFields } from '@dataview/react/views/table/displayFields';
export interface TableSelectRuntime {
    rows: store.KeyedReadStore<ItemId, boolean>;
    cells: {
        state: store.ReadStore<GridSelection | null>;
        range: store.ReadStore<GridSelectionEdges | undefined>;
        visible: store.ReadStore<boolean>;
        cursor: store.ReadStore<CellRef | undefined>;
        selected: store.KeyedReadStore<CellRef, boolean>;
        focus: store.KeyedReadStore<CellRef, boolean>;
    };
    dispose: () => void;
}
const sameRange = (left: GridSelectionEdges | undefined, right: GridSelectionEdges | undefined) => left?.rowStart === right?.rowStart
    && left?.rowEnd === right?.rowEnd
    && left?.fieldStart === right?.fieldStart
    && left?.fieldEnd === right?.fieldEnd;
const collectCellKeys = (selection: GridSelection | null, items: ItemList, fields: TableDisplayedFields | undefined) => {
    if (!selection || !fields) {
        return new Set<CellId>();
    }
    const itemIds = gridSelection.itemIds(selection, items);
    const fieldIds = gridSelection.fieldIds(selection, fields);
    const keys = new Set<CellId>();
    itemIds.forEach(itemId => {
        fieldIds.forEach(fieldId => {
            keys.add(cellId({
                itemId,
                fieldId
            }));
        });
    });
    return keys;
};
const patchBooleanKeyedMembership = (
    membershipStore: store.KeyedStore<CellId, boolean>,
    previous: ReadonlySet<CellId>,
    next: ReadonlySet<CellId>
) => {
    const set: Array<readonly [
        CellId,
        boolean
    ]> = [];
    previous.forEach(key => {
        if (!next.has(key)) {
            set.push([key, false] as const);
        }
    });
    next.forEach(key => {
        if (!previous.has(key)) {
            set.push([key, true] as const);
        }
    });
    if (!set.length) {
        return;
    }
    membershipStore.patch({
        set
    });
};
export const createTableSelectRuntime = (input: {
    rowMembershipStore: store.KeyedReadStore<ItemId, boolean>;
    previewMembershipStore: store.KeyedReadStore<ItemId, boolean | null>;
    gridSelectionStore: store.ReadStore<GridSelection | null>;
    itemsStore: store.ReadStore<ItemList>;
    fieldsStore: store.ReadStore<TableDisplayedFields | undefined>;
    visibleStore: store.ReadStore<boolean>;
}): TableSelectRuntime => {
    const rows = store.keyed<ItemId, boolean>(rowId => {
        const preview = store.read(input.previewMembershipStore, rowId);
        return preview ?? store.read(input.rowMembershipStore, rowId);
    }, {
        keyOf: rowId => rowId,
        isEqual: Object.is
    });
    const range = store.value<GridSelectionEdges | undefined>(() => {
        const fields = store.read(input.fieldsStore);
        const selection = store.read(input.gridSelectionStore);
        return fields && selection
            ? gridSelection.edges(selection, store.read(input.itemsStore), fields)
            : undefined;
    }, {
        isEqual: sameRange
    });
    const cursor = store.value<CellRef | undefined>(() => gridSelection.focus(store.read(input.gridSelectionStore)), {
        isEqual: (left, right) => (left?.itemId === right?.itemId
            && left?.fieldId === right?.fieldId)
    });
    const selectedState = store.keyed<CellId, boolean>({
        emptyValue: false,
        isEqual: Object.is
    });
    const focusState = store.keyed<CellId, boolean>({
        emptyValue: false,
        isEqual: Object.is
    });
    const selected = store.keyed<CellRef, boolean>(cell => store.read(selectedState, cellId(cell)), {
        keyOf: cellId,
        isEqual: Object.is
    });
    const focus = store.keyed<CellRef, boolean>(cell => store.read(focusState, cellId(cell)), {
        keyOf: cellId,
        isEqual: Object.is
    });
    let selectedKeys = new Set<CellId>();
    let focusKey: CellId | undefined;
    const sync = () => {
        const items = store.peek(input.itemsStore);
        const fields = store.peek(input.fieldsStore);
        const selection = store.peek(input.gridSelectionStore);
        const nextSelectedKeys = collectCellKeys(selection, items, fields);
        patchBooleanKeyedMembership(selectedState, selectedKeys, nextSelectedKeys);
        selectedKeys = nextSelectedKeys;
        const nextCursor = selection
            ? gridSelection.focus(selection)
            : undefined;
        const nextFocusKey = nextCursor
            ? cellId(nextCursor)
            : undefined;
        if (focusKey !== nextFocusKey) {
            const set: Array<readonly [
                CellId,
                boolean
            ]> = [];
            if (focusKey) {
                set.push([focusKey, false] as const);
            }
            if (nextFocusKey) {
                set.push([nextFocusKey, true] as const);
            }
            if (set.length) {
                focusState.patch({
                    set
                });
            }
            focusKey = nextFocusKey;
        }
    };
    sync();
    return {
        rows,
        cells: {
            state: input.gridSelectionStore,
            range,
            visible: input.visibleStore,
            cursor,
            selected,
            focus
        },
        dispose: store.join([
            input.itemsStore.subscribe(sync),
            input.fieldsStore.subscribe(sync),
            input.gridSelectionStore.subscribe(sync)
        ])
    };
};
