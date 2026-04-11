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
  resolveViewId: () => ViewId | undefined
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

interface CommandContext {
  readDocument: () => DataDoc
  commitPatch: (patch: ViewPatch) => boolean
  createPatchCommand: (patch: ViewPatch) => ViewPatchAction | undefined
  withView: <T>(fn: (view: View, document: DataDoc) => T) => T | undefined
  withField: <T>(
    fieldId: FieldId,
    fn: (view: View, document: DataDoc, field: Field) => T
  ) => T | undefined
  withFilterField: <T>(
    index: number,
    fn: (view: View, document: DataDoc, field: Field | undefined) => T
  ) => T | undefined
  withGroupField: <T>(
    fn: (view: View, document: DataDoc, field: Field) => T
  ) => T | undefined
}

const createPatchCommand = (
  viewId: ViewId | undefined,
  patch: ViewPatch
): ViewPatchAction | undefined => viewId
  ? ({
  type: 'view.patch',
  viewId,
  patch
  })
  : undefined

const createCommandContext = (
  options: CreateViewCommandNamespacesOptions
): CommandContext => {
  const readContext = (): {
    view: View
    document: DataDoc
  } | undefined => {
    const view = options.readView()
    if (!view) {
      return undefined
    }

    return {
      view,
      document: options.readDocument()
    }
  }

  const commitPatch = (patch: ViewPatch) => {
    const action = createPatchCommand(options.resolveViewId(), patch)
    return action
      ? options.commit(action)
      : false
  }

  const withView = <T,>(
    fn: (view: View, document: DataDoc) => T
  ): T | undefined => {
    const context = readContext()
    if (!context) {
      return undefined
    }

    return fn(context.view, context.document)
  }

  const withField = <T,>(
    fieldId: FieldId,
    fn: (view: View, document: DataDoc, field: Field) => T
  ): T | undefined => withView((view, document) => {
    const field = getDocumentFieldById(document, fieldId)
    if (!field) {
      return undefined
    }

    return fn(view, document, field)
  })

  const withFilterField = <T,>(
    index: number,
    fn: (view: View, document: DataDoc, field: Field | undefined) => T
  ): T | undefined => withView((view, document) => {
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
  ): T | undefined => withView((view, document) => {
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
    readDocument: options.readDocument,
    commitPatch,
    createPatchCommand: patch => createPatchCommand(options.resolveViewId(), patch),
    withView,
    withField,
    withFilterField,
    withGroupField
  }
}

const createTypeCommands = (
  context: CommandContext
): ViewCommandNamespaces['type'] => ({
  set: (value: ViewType) => {
    context.commitPatch({
      type: value
    })
  }
})

const createSearchCommands = (
  context: CommandContext
): ViewCommandNamespaces['search'] => ({
  set: (value: string) => {
    context.withView(view => {
      context.commitPatch({
        search: setSearchQuery(view.search, value)
      })
    })
  }
})

const createFilterCommands = (
  context: CommandContext
): ViewCommandNamespaces['filter'] => ({
  add: (fieldId: FieldId) => {
    context.withField(fieldId, (view, _document, field) => {
      context.commitPatch({
        filter: addFilterRule(view.filter, field)
      })
    })
  },
  set: (index: number, rule: FilterRule) => {
    context.withView(view => {
      context.commitPatch({
        filter: replaceFilterRule(view.filter, index, rule)
      })
    })
  },
  preset: (index: number, presetId: string) => {
    context.withFilterField(index, (view, _document, field) => {
      context.commitPatch({
        filter: setFilterPreset(view.filter, index, field, presetId)
      })
    })
  },
  value: (index: number, value: FilterRule['value'] | undefined) => {
    context.withFilterField(index, (view, _document, field) => {
      context.commitPatch({
        filter: setFilterValue(view.filter, index, field, value)
      })
    })
  },
  mode: (value: Filter['mode']) => {
    context.withView(view => {
      context.commitPatch({
        filter: setFilterMode(view.filter, value)
      })
    })
  },
  remove: (index: number) => {
    context.withView(view => {
      context.commitPatch({
        filter: removeFilterRule(view.filter, index)
      })
    })
  },
  clear: () => {
    context.withView(view => {
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
  context: CommandContext
): ViewCommandNamespaces['sort'] => ({
  add: (fieldId: FieldId, direction?: SortDirection) => {
    context.withView(view => {
      context.commitPatch({
        sort: addSorter(view.sort, fieldId, direction)
      })
    })
  },
  set: (fieldId: FieldId, direction: SortDirection) => {
    context.withView(view => {
      context.commitPatch({
        sort: setSorter(view.sort, fieldId, direction)
      })
    })
  },
  only: (fieldId: FieldId, direction: SortDirection) => {
    context.withView(view => {
      context.commitPatch({
        sort: setOnlySorter(view.sort, fieldId, direction)
      })
    })
  },
  replace: (index: number, sorter: Sorter) => {
    context.withView(view => {
      context.commitPatch({
        sort: replaceSorter(view.sort, index, sorter)
      })
    })
  },
  remove: (index: number) => {
    context.withView(view => {
      context.commitPatch({
        sort: removeSorter(view.sort, index)
      })
    })
  },
  move: (from: number, to: number) => {
    context.withView(view => {
      context.commitPatch({
        sort: moveSorter(view.sort, from, to)
      })
    })
  },
  clear: () => {
    context.withView(view => {
      context.commitPatch({
        sort: clearSorters(view.sort)
      })
    })
  }
})

const createGroupCommands = (
  context: CommandContext
): ViewCommandNamespaces['group'] => ({
  set: (fieldId: FieldId) => {
    context.withField(fieldId, (view, _document, field) => {
      context.commitPatch({
        group: setGroup(view.group, field) ?? null
      })
    })
  },
  clear: () => {
    context.withView(view => {
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
  context: CommandContext
): ViewCommandNamespaces['calc'] => ({
  set: (fieldId: FieldId, metric: CalculationMetric | null) => {
    context.withView(view => {
      context.commitPatch({
        calc: setViewCalcMetric(view.calc, fieldId, metric)
      })
    })
  }
})

const createDisplayCommands = (
  context: CommandContext
): ViewCommandNamespaces['display'] => ({
  replace: (fieldIds: readonly FieldId[]) => {
    context.withView(() => {
      context.commitPatch({
        display: replaceDisplayFields(fieldIds)
      })
    })
  },
  move: (fieldIds: readonly FieldId[], beforeFieldId?: FieldId | null) => {
    context.withView(view => {
      context.commitPatch({
        display: moveDisplayFields(view.display, fieldIds, beforeFieldId)
      })
    })
  },
  show: (fieldId: FieldId, beforeFieldId?: FieldId | null) => {
    context.withView(view => {
      context.commitPatch({
        display: showDisplayField(view.display, fieldId, beforeFieldId)
      })
    })
  },
  hide: (fieldId: FieldId) => {
    context.withView(view => {
      context.commitPatch({
        display: hideDisplayField(view.display, fieldId)
      })
    })
  },
  clear: () => {
    context.withView(() => {
      context.commitPatch({
        display: clearDisplayFields()
      })
    })
  }
})

const createTableSettingsCommands = (
  context: CommandContext
): ViewTableApi => ({
  setColumnWidths: widths => {
    context.withView(view => {
      context.commitPatch({
        options: setTableColumnWidths(view.options, widths)
      })
    })
  },
  setVerticalLines: value => {
    context.withView(view => {
      context.commitPatch({
        options: setTableVerticalLines(view.options, value)
      })
    })
  }
})

const createGalleryCommands = (
  context: CommandContext
): ViewGalleryApi => ({
  setLabels: (value: boolean) => {
    context.withView(view => {
      context.commitPatch({
        options: setGalleryShowFieldLabels(view.options, value)
      })
    })
  },
  setCardSize: (value: GalleryCardSize) => {
    context.withView(view => {
      context.commitPatch({
        options: setGalleryCardSize(view.options, value)
      })
    })
  }
})

const createKanbanCommands = (
  context: CommandContext
): ViewKanbanApi => ({
  setNewRecordPosition: (value: KanbanNewRecordPosition) => {
    context.withView(view => {
      context.commitPatch({
        options: setKanbanNewRecordPosition(view.options, value)
      })
    })
  },
  setFillColor: (value: boolean) => {
    context.withView(view => {
      context.commitPatch({
        options: setKanbanFillColumnColor(view.options, value)
      })
    })
  },
  setCardsPerColumn: (value: KanbanCardsPerColumn) => {
    context.withView(view => {
      context.commitPatch({
        options: setKanbanCardsPerColumn(view.options, value)
      })
    })
  }
})

const createMoveOrderCommand = (
  context: CommandContext,
  recordIds: readonly RecordId[],
  beforeRecordId?: RecordId
): ViewPatchAction | undefined => context.withView(view => {
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
  const context = createCommandContext(options)

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
