import type {
  PropertyId,
  GroupCommand,
  GroupDocument,
  GroupPropertyKind,
  GroupView,
  GroupViewQuery,
  GroupViewType,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentPropertyById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  addViewFilter,
  addViewSorter,
  clearViewGroup,
  clearViewSorters,
  isSameViewQuery,
  moveViewSorter,
  removeViewFilter,
  removeViewSorter,
  replaceViewSorter,
  setOnlyViewSorter,
  setViewFilter,
  setViewGroup,
  setViewGroupBucketInterval,
  setViewGroupBucketSort,
  setViewGroupBucketCollapsed,
  setViewGroupBucketHidden,
  setViewGroupMode,
  setViewGroupShowEmpty,
  setViewSearchQuery,
  setViewSorter,
  toggleViewGroupBucketCollapsed,
  toggleViewGroup
} from '@dataview/core/query'
import {
  TITLE_PROPERTY_ID
} from '@dataview/core/property'
import {
  createUniquePropertyName
} from '@dataview/core/property'
import {
  resolveGrouping,
  resolveSectionRecordIds
} from '@dataview/engine/projection/view'
import { createRecordId } from '@dataview/engine/command/entityId'
import { meta, renderMessage } from '@dataview/meta'
import type {
  GroupEngine,
  GroupViewDisplaySettingsApi,
  GroupViewGallerySettingsApi,
  GroupViewKanbanSettingsApi,
  GroupKanbanApi,
  GroupKanbanCreateCardInput,
  GroupKanbanMoveCardsInput,
  GroupViewOrderApi,
  GroupViewQueryApi,
  GroupViewEngineApi,
  GroupViewSettingsApi,
  GroupViewTableSettingsApi
} from '../types'

const uniqueIds = <T,>(ids: readonly T[]) => Array.from(new Set(ids))

const moveIds = <T,>(
  current: readonly T[],
  ids: readonly T[],
  before?: T | null
) => {
  const movingIds = uniqueIds(ids)
  if (!movingIds.length) {
    return [...current]
  }

  const movingIdSet = new Set(movingIds)
  const remaining = current.filter(item => !movingIdSet.has(item))
  if (before === null || before === undefined) {
    return [...remaining, ...movingIds]
  }

  const insertIndex = remaining.indexOf(before)
  if (insertIndex === -1) {
    return [...remaining, ...movingIds]
  }

  return [
    ...remaining.slice(0, insertIndex),
    ...movingIds,
    ...remaining.slice(insertIndex)
  ]
}

const sameWidths = (
  left: Partial<Record<PropertyId, number>>,
  right: Partial<Record<PropertyId, number>>
) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(key => left[key as PropertyId] === right[key as PropertyId])
}

const resolveQueryGroupProperty = (
  document: GroupDocument,
  query: GroupViewQuery
) => {
  const propertyId = query.group?.property
  if (typeof propertyId !== 'string') {
    return undefined
  }

  return getDocumentPropertyById(document, propertyId as PropertyId)
}

export const createViewEngineApi = (options: {
  engine: Pick<GroupEngine, 'read' | 'command' | 'properties'>
  viewId: ViewId
}): GroupViewEngineApi => {
  const dispatch = (
    command: Parameters<GroupEngine['command']>[0]
  ) => options.engine.command(command)
  const readDocument = () => options.engine.read.document.get()
  const readCurrentView = () => getDocumentViewById(readDocument(), options.viewId)
  const readCurrentState = () => {
    const document = readDocument()
    const view = getDocumentViewById(document, options.viewId)
    if (!view) {
      return undefined
    }

    return {
      document,
      view
    }
  }

  const commitCommands = (commands: readonly GroupCommand[]) => {
    if (!commands.length) {
      return true
    }

    return dispatch(commands).applied
  }

  const commitCommand = (command: GroupCommand | undefined) => {
    if (!command) {
      return false
    }

    return dispatch(command).applied
  }

  const updateQuery = (
    updater: (
      current: GroupViewQuery,
      state: {
        document: ReturnType<typeof readDocument>
        view: GroupView
      }
    ) => GroupViewQuery
  ) => {
    const state = readCurrentState()
    if (!state) {
      return
    }

    const currentQuery = state.view.query
    const nextQuery = updater(currentQuery, state)
    if (isSameViewQuery(currentQuery, nextQuery)) {
      return
    }

    commitCommand({
      type: 'view.query.set',
      viewId: options.viewId,
      query: nextQuery
    })
  }

  const createMoveOrderCommand = (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ): GroupCommand | undefined => {
    const nextRecordIds = uniqueIds(recordIds)
    if (!nextRecordIds.length) {
      return undefined
    }

    return {
      type: 'view.order.move',
      viewId: options.viewId,
      recordIds: nextRecordIds,
      ...(beforeRecordId ? { beforeRecordId } : {})
    }
  }

  const order: GroupViewOrderApi = {
    move: (recordIds, beforeRecordId) => {
      commitCommand(createMoveOrderCommand(recordIds, beforeRecordId))
    },
    clear: () => {
      dispatch({
        type: 'view.order.clear',
        viewId: options.viewId
      })
    }
  }

  const search: GroupViewEngineApi['search'] = {
    setQuery: value => {
      query.setSearchQuery(value)
    }
  }

  const query: GroupViewQueryApi = {
    setSearchQuery: value => {
      updateQuery(current => setViewSearchQuery(current, value))
    },
    addFilter: propertyId => {
      updateQuery((current, state) => {
        const property = getDocumentPropertyById(state.document, propertyId)
        return property
          ? addViewFilter(current, property)
          : current
      })
    },
    setFilter: (index, rule) => {
      updateQuery(current => setViewFilter(current, index, rule))
    },
    removeFilter: index => {
      updateQuery(current => removeViewFilter(current, index))
    },
    addSorter: (propertyId, direction) => {
      updateQuery(current => addViewSorter(current, propertyId, direction))
    },
    setSorter: (propertyId, direction) => {
      updateQuery(current => setViewSorter(current, propertyId, direction))
    },
    setOnlySorter: (propertyId, direction) => {
      updateQuery(current => setOnlyViewSorter(current, propertyId, direction))
    },
    replaceSorter: (index, sorter) => {
      updateQuery(current => replaceViewSorter(current, index, sorter))
    },
    removeSorter: index => {
      updateQuery(current => removeViewSorter(current, index))
    },
    moveSorter: (from, to) => {
      updateQuery(current => moveViewSorter(current, from, to))
    },
    clearSorters: () => {
      updateQuery(current => clearViewSorters(current))
    },
    setGroup: propertyId => {
      updateQuery((current, state) => {
        const property = getDocumentPropertyById(state.document, propertyId)
        return property
          ? setViewGroup(current, property)
          : current
      })
    },
    clearGroup: () => {
      updateQuery(current => clearViewGroup(current))
    },
    toggleGroup: propertyId => {
      updateQuery((current, state) => {
        const property = getDocumentPropertyById(state.document, propertyId)
        return property
          ? toggleViewGroup(current, property)
          : current
      })
    },
    setGroupMode: mode => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? setViewGroupMode(current, property, mode)
          : current
      })
    },
    setGroupBucketSort: bucketSort => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? setViewGroupBucketSort(current, property, bucketSort)
          : current
      })
    },
    setGroupBucketInterval: bucketInterval => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? setViewGroupBucketInterval(current, property, bucketInterval)
          : current
      })
    },
    setGroupShowEmpty: showEmpty => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? setViewGroupShowEmpty(current, property, showEmpty)
          : current
      })
    },
    setGroupBucketHidden: (key, hidden) => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? setViewGroupBucketHidden(current, property, key, hidden)
          : current
      })
    },
    setGroupBucketCollapsed: (key, collapsed) => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? setViewGroupBucketCollapsed(current, property, key, collapsed)
          : current
      })
    },
    toggleGroupBucketCollapsed: key => {
      updateQuery((current, state) => {
        const property = resolveQueryGroupProperty(state.document, current)
        return property
          ? toggleViewGroupBucketCollapsed(current, property, key)
          : current
      })
    }
  }

  const setType = (type: GroupViewType) => {
    const currentView = readCurrentView()
    if (!currentView || currentView.type === type) {
      return
    }

    commitCommand({
      type: 'view.type.set',
      viewId: options.viewId,
      value: type
    })
  }

  const display: GroupViewDisplaySettingsApi = {
    setPropertyIds: propertyIds => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      const currentPropertyIds = state.view.options.display.propertyIds
      if (
        currentPropertyIds.length === propertyIds.length
        && currentPropertyIds.every((propertyId, index) => propertyId === propertyIds[index])
      ) {
        return
      }

      commitCommand({
        type: 'view.display.setPropertyIds',
        viewId: options.viewId,
        propertyIds: [...propertyIds]
      })
    },
    movePropertyIds: (propertyIds, beforePropertyId) => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      display.setPropertyIds(
        moveIds(
          state.view.options.display.propertyIds,
          propertyIds,
          beforePropertyId
        )
      )
    },
    showProperty: (propertyId, beforePropertyId) => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      const currentPropertyIds = state.view.options.display.propertyIds
      const nextPropertyIds = currentPropertyIds.includes(propertyId)
        ? currentPropertyIds
        : [...currentPropertyIds, propertyId]

      display.setPropertyIds(
        moveIds(
          nextPropertyIds,
          [propertyId],
          beforePropertyId
        )
      )
    },
    hideProperty: propertyId => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      display.setPropertyIds(
        state.view.options.display.propertyIds.filter(
          currentPropertyId => currentPropertyId !== propertyId
        )
      )
    }
  }

  const displayApi: GroupViewEngineApi['display'] = {
    setVisibleProperties: propertyIds => {
      display.setPropertyIds(propertyIds)
    },
    moveVisibleProperties: (propertyIds, beforePropertyId) => {
      display.movePropertyIds(propertyIds, beforePropertyId)
    },
    showProperty: (propertyId, beforePropertyId) => {
      display.showProperty(propertyId, beforePropertyId)
    },
    hideProperty: propertyId => {
      display.hideProperty(propertyId)
    }
  }

  const table: GroupViewTableSettingsApi = {
    setColumnWidths: widths => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      const currentWidths = state.view.options.table.widths

      if (sameWidths(currentWidths, widths)) {
        return
      }

      commitCommand({
        type: 'view.table.setWidths',
        viewId: options.viewId,
        widths
      })
    }
  }

  const readVisiblePropertyIds = () => (
    readCurrentView()?.options.display.propertyIds ?? []
  )
  const resolveInsertBeforeId = (
    anchorPropertyId: PropertyId,
    side: 'left' | 'right'
  ): PropertyId | null => {
    const propertyIds = readVisiblePropertyIds()
    const anchorIndex = propertyIds.findIndex(
      propertyId => propertyId === anchorPropertyId
    )
    if (anchorIndex === -1) {
      return null
    }

    return side === 'left'
      ? anchorPropertyId
      : propertyIds[anchorIndex + 1] ?? null
  }
  const createProperty = (input?: {
    name?: string
    kind?: GroupPropertyKind
  }): PropertyId | undefined => {
    const kind = input?.kind ?? 'text'
    const explicitName = input?.name?.trim()
    const name = explicitName || createUniquePropertyName(
      renderMessage(meta.property.kind.get(kind).defaultName),
      options.engine.properties.list()
    )

    if (!name) {
      return undefined
    }

    return options.engine.properties.create({
      name,
      kind
    })
  }
  const tableApi: GroupViewEngineApi['table'] = {
    setColumnWidths: widths => {
      table.setColumnWidths(widths)
    },
    insertColumnLeftOf: (anchorPropertyId, input) => {
      const createdPropertyId = createProperty(input)
      if (!createdPropertyId) {
        return undefined
      }

      display.showProperty(
        createdPropertyId,
        resolveInsertBeforeId(anchorPropertyId, 'left')
      )
      return createdPropertyId
    },
    insertColumnRightOf: (anchorPropertyId, input) => {
      const createdPropertyId = createProperty(input)
      if (!createdPropertyId) {
        return undefined
      }

      display.showProperty(
        createdPropertyId,
        resolveInsertBeforeId(anchorPropertyId, 'right')
      )
      return createdPropertyId
    }
  }

  const gallery: GroupViewGallerySettingsApi = {
    setShowPropertyLabels: checked => {
      const currentView = readCurrentView()
      if (!currentView) {
        return
      }

      if (currentView.options.gallery.showPropertyLabels === checked) {
        return
      }

      commitCommand({
        type: 'view.gallery.setShowPropertyLabels',
        viewId: options.viewId,
        value: checked
      })
    },
    setCardSize: value => {
      const currentView = readCurrentView()
      if (!currentView) {
        return
      }

      if (currentView.options.gallery.cardSize === value) {
        return
      }

      commitCommand({
        type: 'view.gallery.setCardSize',
        viewId: options.viewId,
        value
      })
    }
  }

  const kanbanSettings: GroupViewKanbanSettingsApi = {
    setNewRecordPosition: value => {
      const currentView = readCurrentView()
      if (!currentView) {
        return
      }

      if (currentView.options.kanban.newRecordPosition === value) {
        return
      }

      commitCommand({
        type: 'view.kanban.setNewRecordPosition',
        viewId: options.viewId,
        value
      })
    }
  }

  const settings: GroupViewSettingsApi = {
    display,
    table,
    gallery,
    kanban: kanbanSettings
  }

  const filters: GroupViewEngineApi['filters'] = {
    add: propertyId => {
      query.addFilter(propertyId)
    },
    update: (index, rule) => {
      query.setFilter(index, rule)
    },
    remove: index => {
      query.removeFilter(index)
    },
    clear: () => {
      const count = readCurrentView()?.query.filter.rules.length ?? 0
      for (let index = count - 1; index >= 0; index -= 1) {
        query.removeFilter(index)
      }
    }
  }

  const sorters: GroupViewEngineApi['sorters'] = {
    add: (propertyId, direction) => {
      query.addSorter(propertyId, direction)
    },
    move: (from, to) => {
      query.moveSorter(from, to)
    },
    replace: (index, sorter) => {
      query.replaceSorter(index, sorter)
    },
    remove: index => {
      query.removeSorter(index)
    },
    clear: () => {
      query.clearSorters()
    },
    setOnly: (propertyId, direction) => {
      query.setOnlySorter(propertyId, direction)
    }
  }

  const grouping: GroupViewEngineApi['grouping'] = {
    setProperty: propertyId => {
      query.setGroup(propertyId)
    },
    clear: () => {
      query.clearGroup()
    },
    setMode: mode => {
      query.setGroupMode(mode)
    },
    setBucketSort: bucketSort => {
      query.setGroupBucketSort(bucketSort)
    },
    setBucketInterval: bucketInterval => {
      query.setGroupBucketInterval(bucketInterval)
    },
    setShowEmpty: showEmpty => {
      query.setGroupShowEmpty(showEmpty)
    },
    setBucketHidden: (key, hidden) => {
      query.setGroupBucketHidden(key, hidden)
    },
    setBucketCollapsed: (key, collapsed) => {
      query.setGroupBucketCollapsed(key, collapsed)
    },
    toggleBucketCollapsed: key => {
      query.toggleGroupBucketCollapsed(key)
    }
  }

  const kanban: GroupKanbanApi = {
    createCard: (input: GroupKanbanCreateCardInput) => {
      const document = readDocument()
      const view = readCurrentView()
      const title = input.title.trim()
      if (!view || !title) {
        return undefined
      }

      const grouping = resolveGrouping(document, options.viewId)
      const groupPropertyId = view.query.group?.property
      if (view.query.group && !grouping) {
        return undefined
      }

      const values: Partial<Record<PropertyId, unknown>> = {
        [TITLE_PROPERTY_ID]: title
      }

      if (groupPropertyId && grouping) {
        const next = grouping.next(
          values[groupPropertyId],
          undefined,
          input.groupKey
        )
        if (!next) {
          return undefined
        }

        if ('clear' in next) {
          delete values[groupPropertyId]
        } else {
          values[groupPropertyId] = next.value
        }
      }

      const recordId = createRecordId()
      const commands: GroupCommand[] = [{
        type: 'record.create',
        input: {
          id: recordId,
          values
        }
      }]

      const beforeRecordId = (
        view.type === 'kanban'
        && view.options.kanban.newRecordPosition === 'start'
        && !view.query.sorters.length
      )
        ? resolveSectionRecordIds(
            document,
            options.viewId,
            input.groupKey
          )[0]
        : undefined
      const insertOrderCommand = beforeRecordId
        ? createMoveOrderCommand([recordId], beforeRecordId)
        : undefined
      if (insertOrderCommand) {
        commands.push(insertOrderCommand)
      }

      const result = dispatch(commands)

      return result.applied
        ? recordId
        : undefined
    },
    moveCards: (input: GroupKanbanMoveCardsInput) => {
      const document = readDocument()
      const view = readCurrentView()
      const recordIds = uniqueIds(input.recordIds)

      if (!view || !recordIds.length) {
        return
      }

      const grouping = resolveGrouping(document, options.viewId)
      const propertyId = view.query.group?.property
      if (!grouping || !propertyId) {
        return
      }

      const moveCommand = createMoveOrderCommand(recordIds, input.beforeRecordId)
      if (!moveCommand) {
        return
      }

      const valueCommands: GroupCommand[] = []

      for (const recordId of recordIds) {
        const currentValue = options.engine.read.record.get(recordId)?.values[propertyId]
        const next = grouping.next(
          currentValue,
          undefined,
          input.groupKey
        )
        if (!next) {
          return
        }

        valueCommands.push({
          type: 'value.apply',
          target: {
            type: 'record',
            recordId
          },
          action: 'clear' in next
            ? {
                type: 'clear',
                property: propertyId
              }
            : {
                type: 'set',
                property: propertyId,
                value: next.value
              }
        })
      }

      commitCommands([
        ...valueCommands,
        moveCommand
      ])
    }
  }

  return {
    setType,
    search,
    filters,
    sorters,
    grouping,
    display: displayApi,
    table: tableApi,
    query,
    settings,
    order,
    kanban
  }
}
