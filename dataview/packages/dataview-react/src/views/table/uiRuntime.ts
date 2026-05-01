import type { CellRef, ItemId, ItemList } from '@dataview/engine';
import { createInteractionCoordinator, type InteractionApi } from '@dataview/react/interaction';
import { revealElement, revealY } from '@shared/dom';
import { createItemListSelectionDomain, selectionSnapshot } from '@dataview/runtime';
import { store } from '@shared/core';
import type { ActiveViewQuery } from '@dataview/engine';
import type { PageBody } from '@dataview/runtime';
import type { ItemSelectionController, ItemSelectionSnapshot } from '@dataview/runtime';
import type { TableModel } from '@dataview/runtime';
import type { ValueEditorApi } from '@dataview/runtime';
import { createCapabilities, type Capabilities } from '@dataview/react/views/table/capabilities';
import { createDom, type Dom } from '@dataview/react/views/table/dom';
import type { Nodes } from '@dataview/react/views/table/dom/registry';
import { createCellOpener, type CellOpenInput } from '@dataview/react/views/table/openCell';
import { createRowHit, type RowHit } from '@dataview/react/views/table/dom/rowHit';
import { createTableCanRuntime, type TableCanRuntime } from '@dataview/react/views/table/runtime/can';
import { createTableChromeRuntime, type TableCellChrome, type TableRowChrome } from '@dataview/react/views/table/runtime/chrome';
import { createTableFillRuntime, type TableFillRuntime } from '@dataview/react/views/table/runtime/fill';
import { createTableHover, type TableHoverRuntime } from '@dataview/react/views/table/runtime/hover';
import { createTableRailRuntime, type TableRailRuntime } from '@dataview/react/views/table/runtime/rail';
import { createTableSelectRuntime, type TableSelectRuntime } from '@dataview/react/views/table/runtime/select';
import type { TableLayout } from '@dataview/react/views/table/layout';
import { createTableVirtualRuntime, type TableVirtualRuntime } from '@dataview/react/views/table/virtual/runtime';
import type { TableBlock } from '@dataview/react/views/table/virtual';
import { createTableSelectionRuntime, type TableSelectionRuntime } from '@dataview/react/views/table/selectionRuntime';
import { createTableDisplayedFieldsStore } from '@dataview/react/views/table/displayFields';
import type { TableDisplayedFields } from '@dataview/react/views/table/displayFields';
export interface TableUiRuntime {
    locked: store.ReadStore<boolean>;
    valueEditorOpen: store.ReadStore<boolean>;
    displayedFields: store.ReadStore<TableDisplayedFields | undefined>;
    selection: TableSelectionRuntime;
    select: TableSelectRuntime;
    fill: TableFillRuntime;
    rail: TableRailRuntime;
    can: TableCanRuntime;
    chrome: {
        row: store.KeyedReadStore<ItemId, TableRowChrome>;
        cell: store.KeyedReadStore<CellRef, TableCellChrome>;
    };
    layout: TableLayout;
    virtual: TableVirtualRuntime;
    nodes: Nodes;
    dom: Dom;
    rowHit: RowHit;
    focus: () => void;
    openCell: (input: CellOpenInput) => boolean;
    interaction: InteractionApi;
    hover: TableHoverRuntime;
    revealCursor: () => void;
    revealRow: (rowId: ItemId) => void;
    dispose: () => void;
}
export type { Capabilities, CellOpenInput, TableSelectionRuntime };
const selectionRow = (input: {
    locateRow: (rowId: ItemId) => {
        rowId: ItemId;
        top: number;
        bottom: number;
    } | null;
    items: ItemList;
    selection: ItemSelectionSnapshot;
    gridSelection: ReturnType<TableSelectionRuntime['cells']['get']>;
}): {
    rowId: ItemId;
    top: number;
    bottom: number;
} | null => {
    const rowId = input.gridSelection?.focus.itemId
        ?? selectionSnapshot.primary(createItemListSelectionDomain(input.items), input.selection);
    if (!rowId) {
        return null;
    }
    return input.locateRow(rowId);
};
export const createTableUiRuntime = (options: {
    tableModel: TableModel;
    itemsStore: store.ReadStore<ItemList>;
    queryStore: store.ReadStore<ActiveViewQuery>;
    pageBodyStore: store.ReadStore<PageBody>;
    selection: ItemSelectionController;
    selectionMembershipStore: store.KeyedReadStore<ItemId, boolean>;
    previewSelectionMembershipStore: store.KeyedReadStore<ItemId, boolean | null>;
    marqueeActiveStore: store.ReadStore<boolean>;
    valueEditor: ValueEditorApi;
    layout: TableLayout;
    nodes: Nodes;
}): TableUiRuntime => {
    const body = options.tableModel.body;
    const displayFields = createTableDisplayedFieldsStore(body);
    const selection = createTableSelectionRuntime({
        itemsStore: options.itemsStore,
        fieldsStore: displayFields,
        rowSelection: options.selection
    });
    const lockedStore = store.value<boolean>(() => store.read(options.pageBodyStore).locked);
    const valueEditorOpenStore = store.value<boolean>(() => store.read(options.pageBodyStore).valueEditorOpen);
    const selectionVisibleStore = store.value<boolean>(() => !store.read(valueEditorOpenStore), {
        isEqual: Object.is
    });
    const interaction = createInteractionCoordinator();
    const can = createTableCanRuntime(createCapabilities({
        body,
        query: options.queryStore,
        locked: lockedStore,
        interaction: interaction.store
    }));
    const hover = createTableHover();
    const select = createTableSelectRuntime({
        rowMembershipStore: options.selectionMembershipStore,
        previewMembershipStore: options.previewSelectionMembershipStore,
        gridSelectionStore: selection.cells.store,
        itemsStore: options.itemsStore,
        fieldsStore: displayFields,
        visibleStore: selectionVisibleStore
    });
    const fill = createTableFillRuntime({
        gridSelectionStore: select.cells.state,
        itemsStore: options.itemsStore,
        fieldsStore: displayFields,
        enabledStore: can.fill
    });
    const rail = createTableRailRuntime();
    const chrome = createTableChromeRuntime({
        rowSelected: select.rows,
        rowExposed: rail.row,
        canRowDrag: can.rowDrag,
        cellSelected: select.cells.selected,
        cellFocus: select.cells.focus,
        cellHover: hover.cell,
        cellFill: fill.cell,
        selectionVisible: select.cells.visible
    });
    const virtual = createTableVirtualRuntime({
        body,
        sectionIds: options.tableModel.sectionIds,
        section: options.tableModel.section,
        marqueeActiveStore: options.marqueeActiveStore,
        layout: options.layout
    });
    const dom = createDom({
        layout: options.layout,
        nodes: options.nodes
    });
    const rowHit = createRowHit({
        containerRef: options.layout.containerRef,
        nodes: options.nodes
    });
    const focus = () => {
        dom.container()?.focus({
            preventScroll: true
        });
    };
    const revealTarget = (target: {
        rowId: ItemId;
        top: number;
        bottom: number;
    }) => {
        const scrollNode = dom.scrollRoot();
        if (!scrollNode) {
            return;
        }
        const rowNode = dom.row(target.rowId);
        if (rowNode) {
            revealElement(scrollNode, rowNode, 8);
            return;
        }
        const canvas = dom.canvas();
        if (!canvas) {
            return;
        }
        const canvasRect = canvas.getBoundingClientRect();
        revealY({
            node: scrollNode,
            top: canvasRect.top + target.top,
            bottom: canvasRect.top + target.bottom,
            inset: 8
        });
    };
    const revealRow = (rowId: ItemId) => {
        const target = virtual.locateRow(rowId);
        if (!target) {
            return;
        }
        revealTarget(target);
    };
    const revealCursor = () => {
        const target = selectionRow({
            locateRow: virtual.locateRow,
            items: store.peek(options.itemsStore),
            selection: selection.rows.state.getSnapshot(),
            gridSelection: store.peek(selection.cells.store)
        });
        if (!target) {
            return;
        }
        revealTarget(target);
    };
    const openCell = createCellOpener({
        valueEditor: options.valueEditor,
        resolveField: cell => {
            const currentBody = store.peek(body);
            const currentRow = options.tableModel.row.get(cell.itemId);
            return currentBody && currentRow
                ? {
                    viewId: currentBody.viewId,
                    itemId: cell.itemId,
                    recordId: currentRow.recordId,
                    fieldId: cell.fieldId
                }
                : undefined;
        },
        gridSelection: selection.cells,
        dom,
        revealCursor,
        focus
    });
    return {
        locked: lockedStore,
        valueEditorOpen: valueEditorOpenStore,
        displayedFields: displayFields,
        selection,
        select,
        fill,
        rail,
        can,
        chrome,
        layout: options.layout,
        virtual,
        nodes: options.nodes,
        dom,
        rowHit,
        focus,
        openCell,
        interaction: interaction.api,
        hover,
        revealCursor,
        revealRow,
        dispose: () => {
            interaction.api.cancel();
            selection.dispose();
            select.dispose();
            fill.dispose();
            rail.set(null);
            virtual.dispose();
        }
    };
};
