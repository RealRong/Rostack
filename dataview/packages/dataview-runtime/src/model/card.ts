import { field as fieldApi } from '@dataview/core/field';
import type { CustomField, FieldId, RecordId, TitleField } from '@dataview/core/types';
import { TITLE_FIELD_ID } from '@dataview/core/types';
import type { ItemId } from '@dataview/engine';
import { equal, store } from '@shared/core';
import type { CardContent, CardProperty } from '@dataview/runtime/model/shared';
import { EngineSource } from '@dataview/engine';
const EMPTY_CUSTOM_FIELDS = [] as readonly CustomField[];
const sameProperty = (left: CardProperty, right: CardProperty) => left.field === right.field
    && equal.sameValue(left.value, right.value);
const sameProperties = (left: readonly CardProperty[] | undefined, right: readonly CardProperty[] | undefined) => (left === right
    || (left !== undefined
        && right !== undefined
        && equal.sameOrder(left, right, sameProperty)));
const sameTitle = (left: CardContent['title'], right: CardContent['title']) => left === right || (!!left
    && !!right
    && left.field === right.field
    && left.value === right.value);
const sameContent = (left: CardContent | undefined, right: CardContent | undefined) => left === right || (!!left
    && !!right
    && sameTitle(left.title, right.title)
    && left.hasProperties === right.hasProperties
    && sameProperties(left.properties, right.properties));
export const createVisibleCustomFieldsStore = (input: {
    source: EngineSource;
}): store.ReadStore<readonly CustomField[]> => store.value(() => {
    const fields = store.read(input.source.active.fields.list).all;
    const customFields = fields.filter(fieldApi.kind.isCustom);
    return customFields.length
        ? customFields
        : EMPTY_CUSTOM_FIELDS;
}, {
    isEqual: equal.sameOrder
});
export const createVisibleTitleFieldStore = (input: {
    source: EngineSource;
}): store.ReadStore<TitleField | undefined> => store.value(() => {
    const field = store.read(input.source.document.fields, TITLE_FIELD_ID);
    return field && field.kind === 'title'
        ? field
        : undefined;
}, {
    isEqual: Object.is
});
interface CardPropertiesContext {
    source: EngineSource;
    visibleFields: store.ReadStore<readonly CustomField[]>;
    recordId: RecordId;
}
interface CardContentContext {
    source: EngineSource;
    viewType: 'gallery' | 'kanban';
    titleField: store.ReadStore<TitleField | undefined>;
    properties: store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined>;
    itemId: ItemId;
}
export const cardModelSpec = {
    properties: {
        kind: 'family',
        ids: (context: CardPropertiesContext): readonly FieldId[] => (store.read(context.visibleFields).map(field => field.id)),
        read: (context: CardPropertiesContext, fieldId: FieldId): CardProperty | undefined => {
            const field = store.read(context.visibleFields).find(entry => entry.id === fieldId);
            if (!field) {
                return undefined;
            }
            return {
                field,
                value: store.read(context.source.document.values, {
                    recordId: context.recordId,
                    fieldId
                })
            };
        },
        isEqual: (left: CardProperty | undefined, right: CardProperty | undefined) => left === right || (!!left
            && !!right
            && sameProperty(left, right))
    },
    content: {
        kind: 'value',
        read: (context: CardContentContext): CardContent | undefined => {
            if (store.read(context.source.active.viewType) !== context.viewType) {
                return undefined;
            }
            const item = store.read(context.source.active.items.read.placement, context.itemId);
            if (!item) {
                return undefined;
            }
            const properties = store.read(context.properties, item.recordId);
            const titleValue = store.read(context.source.document.values, {
                recordId: item.recordId,
                fieldId: TITLE_FIELD_ID
            });
            if (titleValue === undefined || !properties) {
                return undefined;
            }
            const titleField = store.read(context.titleField);
            return {
                ...(titleField
                    ? {
                        title: {
                            field: titleField,
                            value: String(titleValue)
                        }
                    }
                    : {}),
                properties,
                hasProperties: properties.some(property => !fieldApi.value.empty(property.value))
            };
        },
        isEqual: sameContent
    }
} as const;
export const createRecordCardPropertiesStore = (input: {
    source: EngineSource;
    fields: store.ReadStore<readonly CustomField[]>;
}): store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined> => store.keyed<RecordId, readonly CardProperty[] | undefined>(recordId => {
    const record = store.read(input.source.document.records, recordId);
    if (!record) {
        return undefined;
    }
    const context: CardPropertiesContext = {
        source: input.source,
        visibleFields: input.fields,
        recordId
    };
    return cardModelSpec.properties.ids(context).flatMap(fieldId => {
        const property = cardModelSpec.properties.read(context, fieldId);
        return property
            ? [property]
            : [];
    });
}, {
    isEqual: sameProperties
});
export const createItemCardContentStore = (input: {
    source: EngineSource;
    viewType: 'gallery' | 'kanban';
    properties: store.KeyedReadStore<RecordId, readonly CardProperty[] | undefined>;
    titleField: store.ReadStore<TitleField | undefined>;
}): store.KeyedReadStore<ItemId, CardContent | undefined> => store.keyed(itemId => {
    if (store.read(input.source.active.viewType) !== input.viewType) {
        return undefined;
    }
    const item = store.read(input.source.active.items.read.placement, itemId);
    if (!item) {
        return undefined;
    }
    const properties = store.read(input.properties, item.recordId);
    const titleValue = store.read(input.source.document.values, {
        recordId: item.recordId,
        fieldId: TITLE_FIELD_ID
    });
    if (titleValue === undefined || !properties) {
        return undefined;
    }
    const context: CardContentContext = {
        source: input.source,
        viewType: input.viewType,
        titleField: input.titleField,
        properties: input.properties,
        itemId
    };
    return cardModelSpec.content.read(context);
}, {
    isEqual: sameContent
});
