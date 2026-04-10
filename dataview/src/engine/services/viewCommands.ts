import type {
  CalculationMetric,
  Command,
  FieldId,
  Filter,
  FilterRule,
  GalleryCardSize,
  KanbanCardsPerColumn,
  KanbanNewRecordPosition,
  RecordId,
  SortDirection,
  Sorter,
  ViewGroup,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type {
  ViewEngineApi,
  ViewGalleryApi,
  ViewKanbanApi,
  ViewOrderApi,
  ViewTableApi
} from '../types'

type ViewCommandType = Extract<Command, { viewId: ViewId }>['type']
type ViewCommandByType<T extends ViewCommandType> = Extract<Command, { type: T, viewId: ViewId }>
type ViewCommandPayload<T extends ViewCommandType> = Omit<ViewCommandByType<T>, 'type' | 'viewId'>

interface CreateViewCommandNamespacesOptions {
  viewId: ViewId
  commit: (command: Command) => boolean
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
  ) => ViewCommandByType<'view.order.move'> | undefined
  clearOrder: ViewOrderApi['clear']
}

export const createViewCommandNamespaces = (
  options: CreateViewCommandNamespacesOptions
): ViewCommandNamespaces => {
  const commitView = <T extends ViewCommandType>(
    type: T,
    payload?: ViewCommandPayload<T>
  ) => options.commit({
    type,
    viewId: options.viewId,
    ...(payload ?? {})
  } as ViewCommandByType<T>)

  const createMoveOrderCommand = (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ): ViewCommandByType<'view.order.move'> | undefined => {
    const nextRecordIds = Array.from(new Set(recordIds))
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

  return {
    type: {
      set: (value: ViewType) => {
        commitView('view.type.set', { value })
      }
    },
    search: {
      set: (value: string) => {
        commitView('view.search.set', { value })
      }
    },
    filter: {
      add: (fieldId: FieldId) => {
        commitView('view.filter.add', { fieldId })
      },
      set: (index: number, rule: FilterRule) => {
        commitView('view.filter.set', { index, rule })
      },
      preset: (index: number, presetId: string) => {
        commitView('view.filter.preset', { index, presetId })
      },
      value: (index: number, value: FilterRule['value'] | undefined) => {
        commitView('view.filter.value', value !== undefined
          ? { index, value }
          : { index })
      },
      mode: (value: Filter['mode']) => {
        commitView('view.filter.mode', { value })
      },
      remove: (index: number) => {
        commitView('view.filter.remove', { index })
      },
      clear: () => {
        commitView('view.filter.clear')
      }
    },
    sort: {
      add: (fieldId: FieldId, direction?: SortDirection) => {
        commitView('view.sort.add', direction
          ? { fieldId, direction }
          : { fieldId })
      },
      set: (fieldId: FieldId, direction: SortDirection) => {
        commitView('view.sort.set', { fieldId, direction })
      },
      only: (fieldId: FieldId, direction: SortDirection) => {
        commitView('view.sort.only', { fieldId, direction })
      },
      replace: (index: number, sorter: Sorter) => {
        commitView('view.sort.replace', { index, sorter })
      },
      remove: (index: number) => {
        commitView('view.sort.remove', { index })
      },
      move: (from: number, to: number) => {
        commitView('view.sort.move', { from, to })
      },
      clear: () => {
        commitView('view.sort.clear')
      }
    },
    group: {
      set: (fieldId: FieldId) => {
        commitView('view.group.set', { fieldId })
      },
      clear: () => {
        commitView('view.group.clear')
      },
      toggle: (fieldId: FieldId) => {
        commitView('view.group.toggle', { fieldId })
      },
      setMode: (value: string) => {
        commitView('view.group.mode.set', { value })
      },
      setSort: (value: ViewGroup['bucketSort']) => {
        commitView('view.group.sort.set', { value })
      },
      setInterval: (value: ViewGroup['bucketInterval']) => {
        commitView('view.group.interval.set', value !== undefined
          ? { value }
          : {})
      },
      setShowEmpty: (value: boolean) => {
        commitView('view.group.empty.set', { value })
      },
      show: (key: string) => {
        commitView('view.group.bucket.show', { key })
      },
      hide: (key: string) => {
        commitView('view.group.bucket.hide', { key })
      },
      collapse: (key: string) => {
        commitView('view.group.bucket.collapse', { key })
      },
      expand: (key: string) => {
        commitView('view.group.bucket.expand', { key })
      },
      toggleCollapse: (key: string) => {
        commitView('view.group.bucket.toggleCollapse', { key })
      }
    },
    calc: {
      set: (fieldId: FieldId, metric: CalculationMetric | null) => {
        commitView('view.calc.set', { fieldId, metric })
      }
    },
    display: {
      replace: (fieldIds: readonly FieldId[]) => {
        commitView('view.display.replace', { fieldIds: [...fieldIds] })
      },
      move: (fieldIds: readonly FieldId[], beforeFieldId?: FieldId | null) => {
        commitView('view.display.move', beforeFieldId !== undefined
          ? { fieldIds: [...fieldIds], beforeFieldId }
          : { fieldIds: [...fieldIds] })
      },
      show: (fieldId: FieldId, beforeFieldId?: FieldId | null) => {
        commitView('view.display.show', beforeFieldId !== undefined
          ? { fieldId, beforeFieldId }
          : { fieldId })
      },
      hide: (fieldId: FieldId) => {
        commitView('view.display.hide', { fieldId })
      },
      clear: () => {
        commitView('view.display.clear')
      }
    },
    tableSettings: {
      setColumnWidths: widths => {
        commitView('view.table.setWidths', { widths })
      },
      setVerticalLines: value => {
        commitView('view.table.verticalLines.set', { value })
      }
    },
    gallery: {
      setLabels: (value: boolean) => {
        commitView('view.gallery.labels.set', { value })
      },
      setCardSize: (value: GalleryCardSize) => {
        commitView('view.gallery.setCardSize', { value })
      }
    },
    kanban: {
      setNewRecordPosition: (value: KanbanNewRecordPosition) => {
        commitView('view.kanban.setNewRecordPosition', { value })
      },
      setFillColor: (value: boolean) => {
        commitView('view.kanban.fillColor.set', { value })
      },
      setCardsPerColumn: (value: KanbanCardsPerColumn) => {
        commitView('view.kanban.cardsPerColumn.set', { value })
      }
    },
    createMoveOrderCommand,
    clearOrder: () => {
      commitView('view.order.clear')
    }
  }
}
