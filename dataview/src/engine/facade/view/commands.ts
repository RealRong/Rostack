import type {
  Action,
  CalculationMetric,
  DataDoc,
  Field,
  FieldId,
  Filter,
  FilterRule,
  GalleryCardSize,
  KanbanCardsPerColumn,
  KanbanNewRecordPosition,
  RecordId,
  SortDirection,
  Sorter,
  View,
  ViewGroup,
  ViewId,
  ViewPatch,
  ViewType
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  addFilterRule,
  cloneFilter,
  removeFilterRule,
  replaceFilterRule,
  setFilterMode,
  setFilterPreset,
  setFilterValue
} from '@dataview/core/filter'
import {
  clearGroup,
  setGroup,
  setGroupBucketCollapsed,
  setGroupBucketHidden,
  setGroupBucketInterval,
  setGroupBucketSort,
  setGroupMode,
  setGroupShowEmpty,
  toggleGroup,
  toggleGroupBucketCollapsed
} from '@dataview/core/group'
import {
  setSearchQuery
} from '@dataview/core/search'
import {
  addSorter,
  clearSorters,
  moveSorter,
  removeSorter,
  replaceSorter,
  setOnlySorter,
  setSorter
} from '@dataview/core/sort'
import {
  clearDisplayFields,
  clearViewOrders,
  hideDisplayField,
  moveDisplayFields,
  reorderViewOrders,
  replaceDisplayFields,
  setGalleryCardSize,
  setGalleryShowFieldLabels,
  setKanbanCardsPerColumn,
  setKanbanFillColumnColor,
  setKanbanNewRecordPosition,
  setTableColumnWidths,
  setTableVerticalLines,
  setViewCalcMetric,
  showDisplayField
} from '@dataview/core/view'
import type {
  ViewEngineApi,
  ViewGalleryApi,
  ViewKanbanApi,
  ViewOrderApi,
  ViewTableApi
} from '../../api/public'

type ViewPatchAction = Extract<Action, { type: 'view.patch' }>

interface CreateViewCommandNamespacesOptions {
  viewId: ViewId
  commit: (action: Action) => boolean
  readDocument: () => DataDoc
  readView: () => View | undefined
}

export interface ViewCommandNamespaces {
  type: ViewEngineApi['type']
  search: ViewEngineApi['search']
  filter: ViewEngineApi['filter']
  sort: ViewEngineApi['sort']
  group: ViewEngineApi['group']
  calc: ViewEngineApi['calc']
  display: ViewEngineApi['display']
  tableSettings: ViewTableApi
  gallery: ViewGalleryApi
  kanban: ViewKanbanApi
  createMoveOrderCommand: (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ) => ViewPatchAction | undefined
  clearOrder: ViewOrderApi['clear']
}

interface ViewPatchContext {
  viewId: ViewId
  readDocument: () => DataDoc
  readView: () => View | undefined
  commitPatch: (patch: ViewPatch) => boolean
  createPatchCommand: (patch: ViewPatch) => ViewPatchAction
  withCurrentView: <T>(fn: (view: View, document: DataDoc) => T) => T | undefined
  withField: <T>(
    fieldId: FieldId,
    fn: (view: View, document: DataDoc, field: Field) => T
  ) => T | undefined
  withFilterRuleField: <T>(
    index: number,
    fn: (view: View, document: DataDoc, field: Field | undefined) => T
  ) => T | undefined
  withGroupField: <T>(
    fn: (view: View, document: DataDoc, field: Field) => T
  ) => T | undefined
}

const createPatchCommand = (
  viewId: ViewId,
  patch: ViewPatch
): ViewPatchAction => ({
  type: 'view.patch',
  viewId,
  patch
})

const createViewPatchContext = (
  options: CreateViewCommandNamespacesOptions
): ViewPatchContext => {
  const commitPatch = (patch: ViewPatch) => options.commit(
    createPatchCommand(options.viewId, patch)
  )

  const withCurrentView = <T,>(
    fn: (view: View, document: DataDoc) => T
  ): T | undefined => {
    const view = options.readView()
    if (!view) {
      return undefined
    }

    return fn(view, options.readDocument())
  }

  const withField = <T,>(
    fieldId: FieldId,
    fn: (view: View, document: DataDoc, field: Field) => T
  ): T | undefined => withCurrentView((view, document) => {
    const field = getDocumentFieldById(document, fieldId)
    if (!field) {
      return undefined
    }

    return fn(view, document, field)
  })

  const withFilterRuleField = <T,>(
    index: number,
    fn: (view: View, document: DataDoc, field: Field | undefined) => T
  ): T | undefined => withCurrentView((view, document) => {
    const fieldId = view.filter.rules[index]?.fieldId
    return fn(
      view,
      document,
      fieldId
        ? getDocumentFieldById(document, fieldId)
        : undefined
    )
  })

  const withGroupField = <T,>(
    fn: (view: View, document: DataDoc, field: Field) => T
  ): T | undefined => withCurrentView((view, document) => {
    if (!view.group) {
      return undefined
    }

    const field = getDocumentFieldById(document, view.group.field)
    if (!field) {
      return undefined
    }

    return fn(view, document, field)
  })

  return {
    viewId: options.viewId,
    readDocument: options.readDocument,
    readView: options.readView,
    commitPatch,
    createPatchCommand: patch => createPatchCommand(options.viewId, patch),
    withCurrentView,
    withField,
    withFilterRuleField,
    withGroupField
  }
}

const createTypeCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['type'] => ({
  set: (value: ViewType) => {
    context.commitPatch({
      type: value
    })
  }
})

const createSearchCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['search'] => ({
  set: (value: string) => {
    context.withCurrentView(view => {
      context.commitPatch({
        search: setSearchQuery(view.search, value)
      })
    })
  }
})

const createFilterCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['filter'] => ({
  add: (fieldId: FieldId) => {
    context.withField(fieldId, (view, _document, field) => {
      context.commitPatch({
        filter: addFilterRule(view.filter, field)
      })
    })
  },
  set: (index: number, rule: FilterRule) => {
    context.withCurrentView(view => {
      context.commitPatch({
        filter: replaceFilterRule(view.filter, index, rule)
      })
    })
  },
  preset: (index: number, presetId: string) => {
    context.withFilterRuleField(index, (view, _document, field) => {
      context.commitPatch({
        filter: setFilterPreset(view.filter, index, field, presetId)
      })
    })
  },
  value: (index: number, value: FilterRule['value'] | undefined) => {
    context.withFilterRuleField(index, (view, _document, field) => {
      context.commitPatch({
        filter: setFilterValue(view.filter, index, field, value)
      })
    })
  },
  mode: (value: Filter['mode']) => {
    context.withCurrentView(view => {
      context.commitPatch({
        filter: setFilterMode(view.filter, value)
      })
    })
  },
  remove: (index: number) => {
    context.withCurrentView(view => {
      context.commitPatch({
        filter: removeFilterRule(view.filter, index)
      })
    })
  },
  clear: () => {
    context.withCurrentView(view => {
      context.commitPatch({
        filter: cloneFilter({
          ...view.filter,
          rules: []
        })
      })
    })
  }
})

const createSortCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['sort'] => ({
  add: (fieldId: FieldId, direction?: SortDirection) => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: addSorter(view.sort, fieldId, direction)
      })
    })
  },
  set: (fieldId: FieldId, direction: SortDirection) => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: setSorter(view.sort, fieldId, direction)
      })
    })
  },
  only: (fieldId: FieldId, direction: SortDirection) => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: setOnlySorter(view.sort, fieldId, direction)
      })
    })
  },
  replace: (index: number, sorter: Sorter) => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: replaceSorter(view.sort, index, sorter)
      })
    })
  },
  remove: (index: number) => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: removeSorter(view.sort, index)
      })
    })
  },
  move: (from: number, to: number) => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: moveSorter(view.sort, from, to)
      })
    })
  },
  clear: () => {
    context.withCurrentView(view => {
      context.commitPatch({
        sort: clearSorters(view.sort)
      })
    })
  }
})

const createGroupCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['group'] => ({
  set: (fieldId: FieldId) => {
    context.withField(fieldId, (view, _document, field) => {
      context.commitPatch({
        group: setGroup(view.group, field) ?? null
      })
    })
  },
  clear: () => {
    context.withCurrentView(view => {
      context.commitPatch({
        group: clearGroup(view.group) ?? null
      })
    })
  },
  toggle: (fieldId: FieldId) => {
    context.withField(fieldId, (view, _document, field) => {
      context.commitPatch({
        group: toggleGroup(view.group, field) ?? null
      })
    })
  },
  setMode: (value: string) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupMode(view.group, field, value) ?? null
      })
    })
  },
  setSort: (value: ViewGroup['bucketSort']) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupBucketSort(view.group, field, value) ?? null
      })
    })
  },
  setInterval: (value: ViewGroup['bucketInterval']) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupBucketInterval(view.group, field, value) ?? null
      })
    })
  },
  setShowEmpty: (value: boolean) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupShowEmpty(view.group, field, value) ?? null
      })
    })
  },
  show: (key: string) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupBucketHidden(view.group, field, key, false) ?? null
      })
    })
  },
  hide: (key: string) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupBucketHidden(view.group, field, key, true) ?? null
      })
    })
  },
  collapse: (key: string) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupBucketCollapsed(view.group, field, key, true) ?? null
      })
    })
  },
  expand: (key: string) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: setGroupBucketCollapsed(view.group, field, key, false) ?? null
      })
    })
  },
  toggleCollapse: (key: string) => {
    context.withGroupField((view, _document, field) => {
      context.commitPatch({
        group: toggleGroupBucketCollapsed(view.group, field, key) ?? null
      })
    })
  }
})

const createCalcCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['calc'] => ({
  set: (fieldId: FieldId, metric: CalculationMetric | null) => {
    context.withCurrentView(view => {
      context.commitPatch({
        calc: setViewCalcMetric(view.calc, fieldId, metric)
      })
    })
  }
})

const createDisplayCommands = (
  context: ViewPatchContext
): ViewCommandNamespaces['display'] => ({
  replace: (fieldIds: readonly FieldId[]) => {
    context.withCurrentView(() => {
      context.commitPatch({
        display: replaceDisplayFields(fieldIds)
      })
    })
  },
  move: (fieldIds: readonly FieldId[], beforeFieldId?: FieldId | null) => {
    context.withCurrentView(view => {
      context.commitPatch({
        display: moveDisplayFields(view.display, fieldIds, beforeFieldId)
      })
    })
  },
  show: (fieldId: FieldId, beforeFieldId?: FieldId | null) => {
    context.withCurrentView(view => {
      context.commitPatch({
        display: showDisplayField(view.display, fieldId, beforeFieldId)
      })
    })
  },
  hide: (fieldId: FieldId) => {
    context.withCurrentView(view => {
      context.commitPatch({
        display: hideDisplayField(view.display, fieldId)
      })
    })
  },
  clear: () => {
    context.withCurrentView(() => {
      context.commitPatch({
        display: clearDisplayFields()
      })
    })
  }
})

const createTableSettingsCommands = (
  context: ViewPatchContext
): ViewTableApi => ({
  setColumnWidths: widths => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setTableColumnWidths(view.options, widths)
      })
    })
  },
  setVerticalLines: value => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setTableVerticalLines(view.options, value)
      })
    })
  }
})

const createGalleryCommands = (
  context: ViewPatchContext
): ViewGalleryApi => ({
  setLabels: (value: boolean) => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setGalleryShowFieldLabels(view.options, value)
      })
    })
  },
  setCardSize: (value: GalleryCardSize) => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setGalleryCardSize(view.options, value)
      })
    })
  }
})

const createKanbanCommands = (
  context: ViewPatchContext
): ViewKanbanApi => ({
  setNewRecordPosition: (value: KanbanNewRecordPosition) => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setKanbanNewRecordPosition(view.options, value)
      })
    })
  },
  setFillColor: (value: boolean) => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setKanbanFillColumnColor(view.options, value)
      })
    })
  },
  setCardsPerColumn: (value: KanbanCardsPerColumn) => {
    context.withCurrentView(view => {
      context.commitPatch({
        options: setKanbanCardsPerColumn(view.options, value)
      })
    })
  }
})

const createMoveOrderCommand = (
  context: ViewPatchContext,
  recordIds: readonly RecordId[],
  beforeRecordId?: RecordId
): ViewPatchAction | undefined => context.withCurrentView(view => {
  if (!recordIds.length) {
    return undefined
  }

  return context.createPatchCommand({
    orders: reorderViewOrders({
      allRecordIds: context.readDocument().records.order,
      currentOrder: view.orders,
      movingRecordIds: recordIds,
      beforeRecordId
    })
  })
})

export const createViewCommandNamespaces = (
  options: CreateViewCommandNamespacesOptions
): ViewCommandNamespaces => {
  const context = createViewPatchContext(options)

  return {
    type: createTypeCommands(context),
    search: createSearchCommands(context),
    filter: createFilterCommands(context),
    sort: createSortCommands(context),
    group: createGroupCommands(context),
    calc: createCalcCommands(context),
    display: createDisplayCommands(context),
    tableSettings: createTableSettingsCommands(context),
    gallery: createGalleryCommands(context),
    kanban: createKanbanCommands(context),
    createMoveOrderCommand: (recordIds, beforeRecordId) => (
      createMoveOrderCommand(context, recordIds, beforeRecordId)
    ),
    clearOrder: () => {
      context.commitPatch({
        orders: clearViewOrders()
      })
    }
  }
}
