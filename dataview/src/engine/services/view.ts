import type {
  FieldId,
  Command,
  DataDoc,
  CustomFieldId,
  CustomFieldKind,
  View,
  ViewQuery,
  ViewType,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById,
  getDocumentViewById
} from '@dataview/core/document'
import { isTitleFieldId } from '@dataview/core/field'
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
  createUniqueFieldName
} from '@dataview/core/field'
import {
  resolveGrouping,
  resolveSectionRecordIds
} from '@dataview/engine/projection/view'
import { createRecordId } from '@dataview/engine/command/entityId'
import { meta, renderMessage } from '@dataview/meta'
import type {
  Engine,
  ViewDisplayApi,
  ViewGalleryApi,
  ViewKanbanApi,
  KanbanApi,
  KanbanCreateCardInput,
  KanbanMoveCardsInput,
  ViewOrderApi,
  ViewQueryApi,
  ViewEngineApi,
  ViewSettingsApi,
  ViewTableApi
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
  left: Partial<Record<FieldId, number>>,
  right: Partial<Record<FieldId, number>>
) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  return leftKeys.every(key => left[key as FieldId] === right[key as FieldId])
}

const resolveQueryGroupField = (
  document: DataDoc,
  query: ViewQuery
) => {
  const fieldId = query.group?.field
  if (typeof fieldId !== 'string') {
    return undefined
  }

  return getDocumentFieldById(document, fieldId as FieldId)
}

export const createViewEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'command' | 'fields'>
  viewId: ViewId
}): ViewEngineApi => {
  const dispatch = (
    command: Parameters<Engine['command']>[0]
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

  const commitCommands = (commands: readonly Command[]) => {
    if (!commands.length) {
      return true
    }

    return dispatch(commands).applied
  }

  const commitCommand = (command: Command | undefined) => {
    if (!command) {
      return false
    }

    return dispatch(command).applied
  }

  const updateQuery = (
    updater: (
      current: ViewQuery,
      state: {
        document: ReturnType<typeof readDocument>
        view: View
      }
    ) => ViewQuery
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
  ): Command | undefined => {
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

  const order: ViewOrderApi = {
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

  const search: ViewEngineApi['search'] = {
    setQuery: value => {
      query.setSearchQuery(value)
    }
  }

  const query: ViewQueryApi = {
    setSearchQuery: value => {
      updateQuery(current => setViewSearchQuery(current, value))
    },
    addFilter: fieldId => {
      updateQuery((current, state) => {
        const field = getDocumentFieldById(state.document, fieldId)
        return field
          ? addViewFilter(current, field)
          : current
      })
    },
    setFilter: (index, rule) => {
      updateQuery(current => setViewFilter(current, index, rule))
    },
    removeFilter: index => {
      updateQuery(current => removeViewFilter(current, index))
    },
    addSorter: (fieldId, direction) => {
      updateQuery(current => addViewSorter(current, fieldId, direction))
    },
    setSorter: (fieldId, direction) => {
      updateQuery(current => setViewSorter(current, fieldId, direction))
    },
    setOnlySorter: (fieldId, direction) => {
      updateQuery(current => setOnlyViewSorter(current, fieldId, direction))
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
    setGroup: fieldId => {
      updateQuery((current, state) => {
        const field = getDocumentFieldById(state.document, fieldId)
        return field
          ? setViewGroup(current, field)
          : current
      })
    },
    clearGroup: () => {
      updateQuery(current => clearViewGroup(current))
    },
    toggleGroup: fieldId => {
      updateQuery((current, state) => {
        const field = getDocumentFieldById(state.document, fieldId)
        return field
          ? toggleViewGroup(current, field)
          : current
      })
    },
    setGroupMode: mode => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? setViewGroupMode(current, field, mode)
          : current
      })
    },
    setGroupBucketSort: bucketSort => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? setViewGroupBucketSort(current, field, bucketSort)
          : current
      })
    },
    setGroupBucketInterval: bucketInterval => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? setViewGroupBucketInterval(current, field, bucketInterval)
          : current
      })
    },
    setGroupShowEmpty: showEmpty => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? setViewGroupShowEmpty(current, field, showEmpty)
          : current
      })
    },
    setGroupBucketHidden: (key, hidden) => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? setViewGroupBucketHidden(current, field, key, hidden)
          : current
      })
    },
    setGroupBucketCollapsed: (key, collapsed) => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? setViewGroupBucketCollapsed(current, field, key, collapsed)
          : current
      })
    },
    toggleGroupBucketCollapsed: key => {
      updateQuery((current, state) => {
        const field = resolveQueryGroupField(state.document, current)
        return field
          ? toggleViewGroupBucketCollapsed(current, field, key)
          : current
      })
    }
  }

  const setType = (type: ViewType) => {
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

  const display: ViewDisplayApi = {
    setFieldIds: fieldIds => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      const currentFieldIds = state.view.options.display.fieldIds
      if (
        currentFieldIds.length === fieldIds.length
        && currentFieldIds.every((fieldId, index) => fieldId === fieldIds[index])
      ) {
        return
      }

      commitCommand({
        type: 'view.display.setFieldIds',
        viewId: options.viewId,
        fieldIds: [...fieldIds]
      })
    },
    moveFieldIds: (fieldIds, beforeFieldId) => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      display.setFieldIds(
        moveIds(
          state.view.options.display.fieldIds,
          fieldIds,
          beforeFieldId
        )
      )
    },
    showField: (fieldId, beforeFieldId) => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      const currentFieldIds = state.view.options.display.fieldIds
      const nextFieldIds = currentFieldIds.includes(fieldId)
        ? currentFieldIds
        : [...currentFieldIds, fieldId]

      display.setFieldIds(
        moveIds(
          nextFieldIds,
          [fieldId],
          beforeFieldId
        )
      )
    },
    hideField: fieldId => {
      const state = readCurrentState()
      if (!state) {
        return
      }

      display.setFieldIds(
        state.view.options.display.fieldIds.filter(
          currentFieldId => currentFieldId !== fieldId
        )
      )
    }
  }

  const displayApi: ViewEngineApi['display'] = {
    setVisibleFields: fieldIds => {
      display.setFieldIds(fieldIds)
    },
    moveVisibleFields: (fieldIds, beforeFieldId) => {
      display.moveFieldIds(fieldIds, beforeFieldId)
    },
    showField: (fieldId, beforeFieldId) => {
      display.showField(fieldId, beforeFieldId)
    },
    hideField: fieldId => {
      display.hideField(fieldId)
    }
  }

  const table: ViewTableApi = {
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
    },
    setShowVerticalLines: checked => {
      const currentView = readCurrentView()
      if (!currentView) {
        return
      }

      if (currentView.options.table.showVerticalLines === checked) {
        return
      }

      commitCommand({
        type: 'view.table.setShowVerticalLines',
        viewId: options.viewId,
        value: checked
      })
    }
  }

  const readVisibleFieldIds = () => (
    readCurrentView()?.options.display.fieldIds ?? []
  )
  const resolveInsertBeforeId = (
    anchorFieldId: FieldId,
    side: 'left' | 'right'
  ): FieldId | null => {
    const fieldIds = readVisibleFieldIds()
    const anchorIndex = fieldIds.findIndex(
      fieldId => fieldId === anchorFieldId
    )
    if (anchorIndex === -1) {
      return null
    }

    return side === 'left'
      ? anchorFieldId
      : fieldIds[anchorIndex + 1] ?? null
  }
  const createProperty = (input?: {
    name?: string
    kind?: CustomFieldKind
  }): CustomFieldId | undefined => {
    const kind = input?.kind ?? 'text'
    const explicitName = input?.name?.trim()
    const name = explicitName || createUniqueFieldName(
      renderMessage(meta.field.kind.get(kind).defaultName),
      options.engine.fields.list()
    )

    if (!name) {
      return undefined
    }

    return options.engine.fields.create({
      name,
      kind
    })
  }
  const tableApi: ViewEngineApi['table'] = {
    setColumnWidths: widths => {
      table.setColumnWidths(widths)
    },
    insertColumnLeftOf: (anchorFieldId, input) => {
      const createdPropertyId = createProperty(input)
      if (!createdPropertyId) {
        return undefined
      }

      display.showField(
        createdPropertyId,
        resolveInsertBeforeId(anchorFieldId, 'left')
      )
      return createdPropertyId
    },
    insertColumnRightOf: (anchorFieldId, input) => {
      const createdPropertyId = createProperty(input)
      if (!createdPropertyId) {
        return undefined
      }

      display.showField(
        createdPropertyId,
        resolveInsertBeforeId(anchorFieldId, 'right')
      )
      return createdPropertyId
    }
  }

  const gallery: ViewGalleryApi = {
    setShowPropertyLabels: checked => {
      const currentView = readCurrentView()
      if (!currentView) {
        return
      }

      if (currentView.options.gallery.showFieldLabels === checked) {
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

  const kanbanSettings: ViewKanbanApi = {
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
    },
    setFillColumnColor: checked => {
      const currentView = readCurrentView()
      if (!currentView) {
        return
      }

      if (currentView.options.kanban.fillColumnColor === checked) {
        return
      }

      commitCommand({
        type: 'view.kanban.setFillColumnColor',
        viewId: options.viewId,
        value: checked
      })
    }
  }

  const settings: ViewSettingsApi = {
    display,
    table,
    gallery,
    kanban: kanbanSettings
  }

  const filters: ViewEngineApi['filters'] = {
    add: fieldId => {
      query.addFilter(fieldId)
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

  const sorters: ViewEngineApi['sorters'] = {
    add: (fieldId, direction) => {
      query.addSorter(fieldId, direction)
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
    setOnly: (fieldId, direction) => {
      query.setOnlySorter(fieldId, direction)
    }
  }

  const grouping: ViewEngineApi['grouping'] = {
    setField: fieldId => {
      query.setGroup(fieldId)
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

  const kanban: KanbanApi = {
    createCard: (input: KanbanCreateCardInput) => {
      const document = readDocument()
      const view = readCurrentView()
      let title = input.title.trim()
      if (!view || !title) {
        return undefined
      }

      const grouping = resolveGrouping(document, options.viewId)
      const groupPropertyId = view.query.group?.field
      if (view.query.group && !grouping) {
        return undefined
      }

      const values: Partial<Record<CustomFieldId, unknown>> = {}

      if (groupPropertyId && grouping) {
        const next = grouping.next(
          isTitleFieldId(groupPropertyId)
            ? title
            : values[groupPropertyId],
          undefined,
          input.groupKey
        )
        if (!next) {
          return undefined
        }

        if (isTitleFieldId(groupPropertyId)) {
          if (!('clear' in next)) {
            title = String(next.value ?? '')
          }
        } else if ('clear' in next) {
          delete values[groupPropertyId]
        } else {
          values[groupPropertyId] = next.value
        }
      }

      const recordId = createRecordId()
      const commands: Command[] = [{
        type: 'record.create',
        input: {
          id: recordId,
          title,
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
    moveCards: (input: KanbanMoveCardsInput) => {
      const document = readDocument()
      const view = readCurrentView()
      const recordIds = uniqueIds(input.recordIds)

      if (!view || !recordIds.length) {
        return
      }

      const grouping = resolveGrouping(document, options.viewId)
      const fieldId = view.query.group?.field
      if (!grouping || !fieldId) {
        return
      }

      const moveCommand = createMoveOrderCommand(recordIds, input.beforeRecordId)
      if (!moveCommand) {
        return
      }

      const valueCommands: Command[] = []

      for (const recordId of recordIds) {
        const record = options.engine.read.record.get(recordId)
        const currentValue = isTitleFieldId(fieldId)
          ? record?.title
          : record?.values[fieldId]
        const next = grouping.next(
          currentValue,
          undefined,
          input.groupKey
        )
        if (!next) {
          return
        }

        valueCommands.push(
          isTitleFieldId(fieldId)
            ? {
                type: 'record.apply',
                target: {
                  type: 'record',
                  recordId
                },
                patch: {
                  title: 'clear' in next
                    ? ''
                    : String(next.value ?? '')
                }
              }
            : {
                type: 'value.apply',
                target: {
                  type: 'record',
                  recordId
                },
                action: 'clear' in next
                  ? {
                      type: 'clear',
                      field: fieldId
                    }
                  : {
                      type: 'set',
                      field: fieldId,
                      value: next.value
                    }
              }
        )
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
