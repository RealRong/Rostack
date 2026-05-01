import { equal, store } from '@shared/core';
import type { CalculationCollection } from '@dataview/core/view';
import type { CalculationMetric, Field, FieldId, RecordId, SortDirection, TableView, ViewId } from '@dataview/core/types';
import type { ActiveViewQuery, CellRef, ItemId, Section, SectionId } from '@dataview/engine';
import type { EngineSource } from '@dataview/engine';
const EMPTY_SECTION_IDS = [] as readonly SectionId[];
const DEFAULT_COLUMN_WIDTH = 160;
const MIN_COLUMN_WIDTH = 96;
const DEFAULT_WIDTHS_BY_KIND: Readonly<Record<Field['kind'], number>> = {
    title: 320,
    text: 240,
    url: 220,
    email: 220,
    phone: 180,
    status: 160,
    select: 160,
    multiSelect: 180,
    number: 140,
    date: 160,
    boolean: 96,
    asset: 200
};
export interface TableColumn {
    field: Field;
    width: number;
    grouped: boolean;
    sortDir?: SortDirection;
    calc?: CalculationMetric;
}
export interface TableBody {
    viewId: ViewId;
    columns: readonly TableColumn[];
    rowCount: number;
    grouped: boolean;
    wrap: boolean;
    showVerticalLines: boolean;
}
export interface TableRow {
    itemId: ItemId;
    recordId: RecordId;
    sectionId: SectionId;
}
export interface TableCell {
    itemId: ItemId;
    recordId: RecordId;
    viewId: ViewId;
    field: Field;
    value: unknown;
}
export interface TableModel {
    body: store.ReadStore<TableBody | null>;
    sectionIds: store.ReadStore<readonly SectionId[]>;
    section: store.KeyedReadStore<SectionId, Section | undefined>;
    row: store.KeyedReadStore<ItemId, TableRow | undefined>;
    cell: store.KeyedReadStore<CellRef, TableCell | undefined>;
    summary: store.KeyedReadStore<SectionId, CalculationCollection | undefined>;
}
const readTableView = (source: EngineSource): TableView | undefined => {
    const view = store.read(source.active.view);
    return view?.type === 'table'
        ? view
        : undefined;
};
const readSortDir = (query: ActiveViewQuery, fieldId: FieldId): SortDirection | undefined => query.sort.rules.find(rule => rule.rule.fieldId === fieldId)?.rule.direction;
const resolveColumnWidth = (field: Field, widths: TableView['options']['widths']) => Math.max(MIN_COLUMN_WIDTH, widths[field.id] ?? DEFAULT_WIDTHS_BY_KIND[field.kind] ?? DEFAULT_COLUMN_WIDTH);
const sameColumn = (left: TableColumn, right: TableColumn) => left.field === right.field
    && left.width === right.width
    && left.grouped === right.grouped
    && left.sortDir === right.sortDir
    && left.calc === right.calc;
const sameBody = (left: TableBody | null, right: TableBody | null) => left === right || (!!left
    && !!right
    && left.viewId === right.viewId
    && left.columns === right.columns
    && left.rowCount === right.rowCount
    && left.grouped === right.grouped
    && left.wrap === right.wrap
    && left.showVerticalLines === right.showVerticalLines);
const sameRow = (left: TableRow | undefined, right: TableRow | undefined) => left === right || (!!left
    && !!right
    && left.itemId === right.itemId
    && left.recordId === right.recordId
    && left.sectionId === right.sectionId);
const sameCell = (left: TableCell | undefined, right: TableCell | undefined) => left === right || (!!left
    && !!right
    && left.itemId === right.itemId
    && left.recordId === right.recordId
    && left.viewId === right.viewId
    && left.field === right.field
    && equal.sameJsonValue(left.value, right.value));
const resolveColumns = (input: {
    previous?: readonly TableColumn[];
    fieldIds: readonly FieldId[];
    readField: (fieldId: FieldId) => Field | undefined;
    widths: TableView['options']['widths'];
    query: ActiveViewQuery;
    calcByField: ReadonlyMap<FieldId, CalculationMetric | undefined>;
}): readonly TableColumn[] => {
    const resolvedFields = input.fieldIds.flatMap(fieldId => {
        const field = input.readField(fieldId);
        return field
            ? [field]
            : [];
    });
    const canReuse = Boolean(input.previous
        && input.previous.length === resolvedFields.length
        && resolvedFields.every((field, index) => {
            const previous = input.previous![index];
            if (!previous) {
                return false;
            }
            return sameColumn(previous, {
                field,
                width: resolveColumnWidth(field, input.widths),
                grouped: input.query.group?.fieldId === field.id,
                sortDir: readSortDir(input.query, field.id),
                calc: input.calcByField.get(field.id)
            });
        }));
    if (canReuse) {
        return input.previous as readonly TableColumn[];
    }
    return resolvedFields.map<TableColumn>(field => ({
        field,
        width: resolveColumnWidth(field, input.widths),
        grouped: input.query.group?.fieldId === field.id,
        sortDir: readSortDir(input.query, field.id),
        calc: input.calcByField.get(field.id)
    }));
};
export const createTableModel = (source: EngineSource): TableModel => {
    let previousColumns: readonly TableColumn[] | undefined;
    const body = store.value<TableBody | null>(() => {
        const tableView = readTableView(source);
        if (!tableView) {
            previousColumns = undefined;
            return null;
        }
        const query = store.read(source.active.query);
        const table = store.read(source.active.table);
        const columns = resolveColumns({
            previous: previousColumns,
            fieldIds: tableView.display.fields,
            readField: fieldId => store.read(source.active.fields, fieldId),
            widths: tableView.options.widths,
            query,
            calcByField: table.calc
        });
        previousColumns = columns;
        return {
            viewId: tableView.id,
            columns,
            rowCount: store.read(source.active.items.list).count,
            grouped: Boolean(query.group),
            wrap: table.wrap,
            showVerticalLines: table.showVerticalLines
        };
    }, {
        isEqual: sameBody
    });
    const sectionIds = store.value<readonly SectionId[]>(() => readTableView(source)
        ? store.read(source.active.sections.ids)
        : EMPTY_SECTION_IDS, {
        isEqual: equal.sameOrder
    });
    const section = store.keyed<SectionId, Section | undefined>(sectionId => readTableView(source)
        ? store.read(source.active.sections, sectionId)
        : undefined, {
        isEqual: Object.is
    });
    const row = store.keyed<ItemId, TableRow | undefined>(itemId => {
        if (!readTableView(source)) {
            return undefined;
        }
        const placement = store.read(source.active.items.read.placement, itemId);
        return placement
            ? {
                itemId,
                recordId: placement.recordId,
                sectionId: placement.sectionId
            }
            : undefined;
    }, {
        isEqual: sameRow
    });
    const cell = store.keyed<CellRef, TableCell | undefined>(current => {
        const currentBody = store.read(body);
        if (!currentBody) {
            return undefined;
        }
        const currentRow = store.read(row, current.itemId);
        if (!currentRow) {
            return undefined;
        }
        const field = store.read(source.active.fields, current.fieldId);
        if (!field) {
            return undefined;
        }
        return {
            itemId: current.itemId,
            recordId: currentRow.recordId,
            viewId: currentBody.viewId,
            field,
            value: store.read(source.document.values, {
                recordId: currentRow.recordId,
                fieldId: current.fieldId
            })
        };
    }, {
        isEqual: sameCell
    });
    const summary = store.keyed<SectionId, CalculationCollection | undefined>(sectionId => readTableView(source)
        ? store.read(source.active.summaries, sectionId)
        : undefined, {
        isEqual: Object.is
    });
    return {
        body,
        sectionIds,
        section,
        row,
        cell,
        summary
    };
};
