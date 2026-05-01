import type { Field, FieldId, View, ViewId, ViewSortRuleId } from '@dataview/core/types';
import { equal, store, type collection } from '@shared/core';
import type { PageBody, PageHeader, PageModel, PageQuery, PageSortPanel, PageSortRow, PageSettings, PageToolbar } from '@dataview/runtime/model/page/types';
import type { EngineSource } from '@dataview/engine';
import { queryFieldOptions } from '@dataview/runtime/model/page/queryFieldOptions';
import { createFamilyModelStore, createValueModelStore } from '@dataview/runtime/model/spec';
import { resolvePageQueryBarState, resolvePageSettingsState, type PageSessionState } from '@dataview/runtime/session/page';
const EMPTY_FIELD_IDS: readonly FieldId[] = [];
const EMPTY_FIELDS: readonly Field[] = [];
const sameRoute = (left: PageQuery['route'], right: PageQuery['route']) => {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.kind === right.kind
        && (left.kind !== 'filter' || right.kind !== 'filter' || left.id === right.id)
        && (left.kind !== 'sort' || right.kind !== 'sort' || left.id === right.id);
};
const sameQueryBar = (left: PageToolbar['queryBar'], right: PageToolbar['queryBar']) => left.visible === right.visible
    && sameRoute(left.route, right.route);
const sameBody = (left: PageBody, right: PageBody) => left.viewType === right.viewType
    && left.empty === right.empty
    && left.valueEditorOpen === right.valueEditorOpen
    && left.locked === right.locked;
const sameHeader = (left: PageHeader, right: PageHeader) => left.viewId === right.viewId
    && left.viewType === right.viewType
    && left.viewName === right.viewName;
const sameToolbar = (left: PageToolbar, right: PageToolbar) => left.view === right.view
    && left.viewId === right.viewId
    && sameQueryBar(left.queryBar, right.queryBar)
    && left.search === right.search
    && left.filterCount === right.filterCount
    && left.sortCount === right.sortCount
    && equal.sameOrder(left.views, right.views)
    && equal.sameOrder(left.availableFilterFields, right.availableFilterFields)
    && equal.sameOrder(left.availableSortFields, right.availableSortFields);
const sameQuery = (left: PageQuery, right: PageQuery) => left.visible === right.visible
    && sameRoute(left.route, right.route)
    && left.view === right.view
    && left.filters === right.filters
    && left.sorts === right.sorts
    && equal.sameOrder(left.availableFilterFields, right.availableFilterFields)
    && equal.sameOrder(left.availableSortFields, right.availableSortFields);
const sameSettingsRoute = (left: PageSettings['route'], right: PageSettings['route']) => left.kind === right.kind
    && (left.kind !== 'field'
        || right.kind !== 'field'
        || left.fieldId === right.fieldId)
    && (left.kind !== 'root'
        || right.kind !== 'root'
        || left.focusTarget === right.focusTarget);
const sameSettings = (left: PageSettings, right: PageSettings) => left.visible === right.visible
    && sameSettingsRoute(left.route, right.route)
    && left.viewsCount === right.viewsCount
    && left.view === right.view
    && left.filter === right.filter
    && left.sort === right.sort
    && left.group === right.group
    && equal.sameOrder(left.displayFieldIds, right.displayFieldIds)
    && equal.sameOrder(left.visibleFields, right.visibleFields)
    && equal.sameOrder(left.hiddenFields, right.hiddenFields)
    && equal.sameOrder(left.fields, right.fields);
const sameSortPanel = (left: PageSortPanel, right: PageSortPanel) => equal.sameOrder(left.rules, right.rules)
    && equal.sameOrder(left.availableFields, right.availableFields);
const sameSortRow = (left: PageSortRow | undefined, right: PageSortRow | undefined) => left === right || (!!left
    && !!right
    && left.rule === right.rule
    && left.field === right.field
    && equal.sameOrder(left.availableFields, right.availableFields));
const createAvailableFieldsStore = <TField extends Field>(input: {
    fields: store.ReadStore<collection.OrderedKeyedCollection<FieldId, TField>>;
    usedFieldIds: store.ReadStore<readonly FieldId[]>;
}) => store.value<readonly TField[]>(() => {
    const fields = store.read(input.fields).all;
    const usedFieldIds = store.read(input.usedFieldIds);
    if (!usedFieldIds.length) {
        return fields;
    }
    const usedFieldIdSet = new Set(usedFieldIds);
    return fields.filter(field => !usedFieldIdSet.has(field.id));
}, {
    isEqual: equal.sameOrder
});
interface PageModelContext {
    source: EngineSource;
    pageSessionStore: store.ReadStore<PageSessionState>;
    valueEditorOpenStore: store.ReadStore<boolean>;
    fields: store.ReadStore<collection.OrderedKeyedCollection<FieldId, Field>>;
    views: store.ReadStore<collection.OrderedKeyedCollection<ViewId, View>>;
    view: store.ReadStore<View | undefined>;
    queryBar: store.ReadStore<PageToolbar['queryBar']>;
    availableFilterFields: store.ReadStore<readonly Field[]>;
    availableSortFields: store.ReadStore<readonly Field[]>;
    filterCount: store.ReadStore<number>;
    sortCount: store.ReadStore<number>;
    sortRules: store.ReadStore<PageSortPanel['rules']>;
    settingsState: store.ReadStore<{
        visible: boolean;
        route: PageSettings['route'];
    }>;
    displayFieldIds: store.ReadStore<readonly FieldId[]>;
    visibleFields: store.ReadStore<readonly Field[]>;
    hiddenFields: store.ReadStore<readonly Field[]>;
}
export const pageModelSpec = {
    body: {
        kind: 'value',
        read: (context: PageModelContext): PageBody => ({
            viewType: store.read(context.source.active.viewType),
            empty: store.read(context.source.active.items.list).count === 0,
            valueEditorOpen: store.read(context.valueEditorOpenStore),
            locked: store.read(context.valueEditorOpenStore)
        }),
        isEqual: sameBody
    },
    header: {
        kind: 'value',
        read: (context: PageModelContext): PageHeader => {
            const currentView = store.read(context.view);
            return {
                viewId: store.read(context.source.active.viewId),
                viewType: currentView?.type,
                viewName: currentView?.name
            };
        },
        isEqual: sameHeader
    },
    toolbar: {
        kind: 'value',
        read: (context: PageModelContext): PageToolbar => ({
            views: store.read(context.views).all,
            view: store.read(context.view),
            viewId: store.read(context.source.active.viewId),
            queryBar: store.read(context.queryBar),
            search: store.read(context.source.active.query).search.query,
            filterCount: store.read(context.filterCount),
            sortCount: store.read(context.sortCount),
            availableFilterFields: store.read(context.availableFilterFields),
            availableSortFields: store.read(context.availableSortFields)
        }),
        isEqual: sameToolbar
    },
    query: {
        kind: 'value',
        read: (context: PageModelContext): PageQuery => {
            const currentQueryBar = store.read(context.queryBar);
            return {
                visible: currentQueryBar.visible,
                route: currentQueryBar.route,
                view: store.read(context.view),
                filters: store.read(context.source.active.query).filters.rules,
                sorts: store.read(context.sortRules),
                availableFilterFields: store.read(context.availableFilterFields),
                availableSortFields: store.read(context.availableSortFields)
            };
        },
        isEqual: sameQuery
    },
    sortPanel: {
        kind: 'value',
        read: (context: PageModelContext): PageSortPanel => ({
            rules: store.read(context.sortRules),
            availableFields: store.read(context.availableSortFields)
        }),
        isEqual: sameSortPanel
    },
    settings: {
        kind: 'value',
        read: (context: PageModelContext): PageSettings => {
            const currentSettings = store.read(context.settingsState);
            return {
                visible: currentSettings.visible,
                route: currentSettings.route,
                viewsCount: store.read(context.views).count,
                fields: store.read(context.fields).all,
                displayFieldIds: store.read(context.displayFieldIds),
                visibleFields: store.read(context.visibleFields),
                hiddenFields: store.read(context.hiddenFields),
                view: store.read(context.view),
                filter: store.read(context.source.active.query).filters,
                sort: store.read(context.source.active.query).sort,
                group: store.read(context.source.active.query).group
            };
        },
        isEqual: sameSettings
    },
    sortRow: {
        kind: 'family',
        ids: (context: PageModelContext): readonly ViewSortRuleId[] => (store.read(context.sortRules).map(entry => entry.rule.id)),
        read: (context: PageModelContext, id: ViewSortRuleId): PageSortRow | undefined => {
            const currentRules = store.read(context.sortRules);
            const currentRow = currentRules.find(entry => entry.rule.id === id);
            if (!currentRow) {
                return undefined;
            }
            const allFields = store.read(context.fields);
            const currentSortRules = currentRules.map(entry => entry.rule);
            return {
                rule: currentRow.rule,
                field: currentRow.field,
                availableFields: queryFieldOptions.available.sortAt(allFields.all, currentSortRules, id)
            };
        },
        isEqual: sameSortRow
    }
} as const;
export const createPageModel = (input: {
    source: EngineSource;
    pageSessionStore: store.ReadStore<PageSessionState>;
    valueEditorOpenStore: store.ReadStore<boolean>;
}): PageModel => {
    const fields = input.source.document.fields.list;
    const views = input.source.document.views.list;
    const view = input.source.active.view;
    const filterFieldIds = store.value<readonly FieldId[]>(() => {
        const ids = queryFieldOptions.used.filterIds(store.read(input.source.active.query).filters.rules.map(rule => rule.rule));
        return ids.length
            ? ids
            : EMPTY_FIELD_IDS;
    }, {
        isEqual: equal.sameOrder
    });
    const sortFieldIds = store.value<readonly FieldId[]>(() => {
        const ids = queryFieldOptions.used.sortIds(store.read(input.source.active.query).sort.rules.map(rule => rule.rule));
        return ids.length
            ? ids
            : EMPTY_FIELD_IDS;
    }, {
        isEqual: equal.sameOrder
    });
    const availableFilterFields = createAvailableFieldsStore({
        fields,
        usedFieldIds: filterFieldIds
    });
    const availableSortFields = createAvailableFieldsStore({
        fields,
        usedFieldIds: sortFieldIds
    });
    const filterCount = store.value<number>(() => store.read(input.source.active.query).filters.rules.length, {
        isEqual: Object.is
    });
    const sortCount = store.value<number>(() => store.read(input.source.active.query).sort.rules.length, {
        isEqual: Object.is
    });
    const sortRules = store.value<PageSortPanel['rules']>(() => store.read(input.source.active.query).sort.rules, {
        isEqual: equal.sameOrder
    });
    const queryBar = store.value<PageToolbar['queryBar']>(() => resolvePageQueryBarState({
        view: store.read(view),
        query: store.read(input.pageSessionStore).query
    }), {
        isEqual: sameQueryBar
    });
    const settingsState = store.value<{
        visible: boolean;
        route: PageSettings['route'];
    }>(() => resolvePageSettingsState({
        fields: store.read(fields).all,
        activeViewId: store.read(input.source.active.viewId),
        activeViewType: store.read(input.source.active.viewType),
        settings: store.read(input.pageSessionStore).settings
    }), {
        isEqual: (left, right) => (left.visible === right.visible
            && sameSettingsRoute(left.route, right.route))
    });
    const displayFieldIds = store.value<readonly FieldId[]>(() => store.read(view)?.display.fields ?? EMPTY_FIELD_IDS, {
        isEqual: equal.sameOrder
    });
    const visibleFields = store.value<readonly Field[]>(() => {
        const orderedFieldIds = store.read(displayFieldIds);
        if (!orderedFieldIds.length) {
            return EMPTY_FIELDS;
        }
        const fieldList = store.read(fields);
        return orderedFieldIds.flatMap(fieldId => {
            const field = fieldList.get(fieldId);
            return field
                ? [field]
                : [];
        });
    }, {
        isEqual: equal.sameOrder
    });
    const hiddenFields = store.value<readonly Field[]>(() => {
        const allFields = store.read(fields).all;
        const shownFieldIds = store.read(displayFieldIds);
        if (!shownFieldIds.length) {
            return allFields;
        }
        const shownFieldIdSet = new Set(shownFieldIds);
        return allFields.filter(field => !shownFieldIdSet.has(field.id));
    }, {
        isEqual: equal.sameOrder
    });
    const context: PageModelContext = {
        source: input.source,
        pageSessionStore: input.pageSessionStore,
        valueEditorOpenStore: input.valueEditorOpenStore,
        fields,
        views,
        view,
        queryBar,
        availableFilterFields,
        availableSortFields,
        filterCount,
        sortCount,
        sortRules,
        settingsState,
        displayFieldIds,
        visibleFields,
        hiddenFields
    };
    return {
        body: createValueModelStore(context, pageModelSpec.body),
        header: createValueModelStore(context, pageModelSpec.header),
        toolbar: createValueModelStore(context, pageModelSpec.toolbar),
        query: createValueModelStore(context, pageModelSpec.query),
        sortPanel: createValueModelStore(context, pageModelSpec.sortPanel),
        sortRow: createFamilyModelStore(context, pageModelSpec.sortRow),
        settings: createValueModelStore(context, pageModelSpec.settings)
    };
};
