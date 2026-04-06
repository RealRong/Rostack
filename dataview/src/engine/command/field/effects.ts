import type { GroupBaseOperation } from '@dataview/core/contracts/operations'
import type {
  GroupDocument,
  GroupProperty,
  GroupView,
  PropertyId
} from '@dataview/core/contracts/state'
import {
  getDocumentViews
} from '@dataview/core/document'
import {
  getPropertyFilterOps,
  getPropertyGroupMeta
} from '@dataview/core/property'
import {
  cloneGroupViewOptions,
  prunePropertyFromViewOptions
} from '@dataview/core/view'

const buildViewPutOperation = (view: GroupView): GroupBaseOperation => ({
  type: 'document.view.put',
  view
})

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

const cleanupSearchProperties = (
  propertyIds: readonly PropertyId[] | undefined,
  propertyId: PropertyId
) => {
  if (!propertyIds?.length) {
    return propertyIds ? [...propertyIds] : undefined
  }

  const nextPropertyIds = propertyIds.filter(currentPropertyId => currentPropertyId !== propertyId)
  return nextPropertyIds.length ? [...nextPropertyIds] : undefined
}

const cleanupViewForRemovedProperty = (
  view: GroupView,
  propertyId: PropertyId
) => {
  const nextOptions = prunePropertyFromViewOptions(view.options, propertyId)
  const nextFilterRules = view.query.filter.rules.filter(rule => rule.property !== propertyId)
  const nextSorters = view.query.sorters.filter(sorter => sorter.property !== propertyId)
  const nextSearchProperties = cleanupSearchProperties(view.query.search.properties, propertyId)
  const nextGroup = view.query.group?.property === propertyId
    ? undefined
    : view.query.group
  const nextAggregates = view.aggregates.filter(spec => spec.property !== propertyId)

  const nextView: GroupView = {
    ...view,
    query: {
      ...view.query,
      filter: {
        ...view.query.filter,
        rules: nextFilterRules
      },
      search: {
        ...view.query.search,
        ...(nextSearchProperties !== undefined
          ? { properties: nextSearchProperties }
          : {})
      },
      sorters: nextSorters,
      ...(nextGroup ? { group: nextGroup } : {})
    },
    aggregates: nextAggregates,
    options: nextOptions
  }

  if (nextSearchProperties === undefined && Object.prototype.hasOwnProperty.call(nextView.query.search, 'properties')) {
    delete (nextView.query.search as { properties?: readonly PropertyId[] }).properties
  }
  if (!nextGroup && Object.prototype.hasOwnProperty.call(nextView.query, 'group')) {
    delete (nextView.query as { group?: GroupView['query']['group'] }).group
  }

  return sameJson(nextView, view) ? view : nextView
}

const cleanupViewForConvertedProperty = (
  view: GroupView,
  property: GroupProperty
) => {
  const validFilterOps = new Set(getPropertyFilterOps(property))
  const nextFilterRules = view.query.filter.rules.filter(rule => (
    rule.property !== property.id || validFilterOps.has(rule.op)
  ))

  let nextGroup = view.query.group
  if (view.query.group?.property === property.id) {
    const defaultMeta = getPropertyGroupMeta(property)
    if (!defaultMeta.modes.length || !defaultMeta.sorts.length) {
      nextGroup = undefined
    } else {
      const modeMeta = getPropertyGroupMeta(property, { mode: view.query.group.mode })
      nextGroup = {
        property: property.id,
        mode: modeMeta.mode,
        bucketSort: modeMeta.sort || 'manual',
        ...(modeMeta.bucketInterval !== undefined
          ? { bucketInterval: modeMeta.bucketInterval }
          : {})
      }
    }
  }

  const nextView: GroupView = {
    ...view,
    query: {
      ...view.query,
      filter: {
        ...view.query.filter,
        rules: nextFilterRules
      },
      ...(nextGroup ? { group: nextGroup } : {})
    }
  }

  if (!nextGroup && Object.prototype.hasOwnProperty.call(nextView.query, 'group')) {
    delete (nextView.query as { group?: GroupView['query']['group'] }).group
  }

  return sameJson(nextView, view) ? view : nextView
}

export const resolvePropertyCreateViewOperations = (
  document: GroupDocument,
  property: GroupProperty
): GroupBaseOperation[] => {
  return getDocumentViews(document)
    .filter(view => view.type === 'table')
    .flatMap(view => {
      if (view.options.display.propertyIds.includes(property.id)) {
        return []
      }

      return [buildViewPutOperation({
        ...view,
        options: {
          ...cloneGroupViewOptions(view.options),
          display: {
            propertyIds: [...view.options.display.propertyIds, property.id]
          }
        }
      })]
    })
}

export const resolvePropertyRemoveViewOperations = (
  document: GroupDocument,
  propertyId: PropertyId
): GroupBaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = cleanupViewForRemovedProperty(view, propertyId)
      return nextView === view ? [] : [buildViewPutOperation(nextView)]
    })
)

export const resolvePropertyConvertViewOperations = (
  document: GroupDocument,
  property: GroupProperty
): GroupBaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = cleanupViewForConvertedProperty(view, property)
      return nextView === view ? [] : [buildViewPutOperation(nextView)]
    })
)
