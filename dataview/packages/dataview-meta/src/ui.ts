import type {
  KanbanCardsPerColumn,
  Field,
  FilterRule,
  Sorter,
  ViewType
} from '@dataview/core/contracts'
import { message, renderMessage, type MessageSpec } from '@dataview/meta/message'
import { sort } from '@dataview/meta/sort'
import { view } from '@dataview/meta/view'

type SettingsRouteKind =
  | 'root'
  | 'layout'
  | 'group'
  | 'groupField'
  | 'viewProperties'
  | 'fieldList'
  | 'fieldCreate'
  | 'fieldSchema'
  | 'filter'
  | 'sort'

type CardSizeId = 'sm' | 'md' | 'lg'
type NewRecordPositionId = 'start' | 'end'
type CardsPerColumnId = KanbanCardsPerColumn
type LayoutTypeId = 'table' | 'kanban' | 'gallery'

const findField = (
  fields: readonly Field[],
  fieldId: unknown
) => (
  typeof fieldId === 'string'
    ? fields.find(field => field.id === fieldId)
    : undefined
)

const summarizeCount = (
  key: string,
  singular: string,
  plural: string,
  count: number
): MessageSpec => (
  count === 1
    ? message(`${key}.single`, singular, { count })
    : message(`${key}.multiple`, plural, { count })
)

export const ui = {
  fieldPicker: {
    searchPlaceholder: message('meta.ui.fieldPicker.searchPlaceholder', 'Search fields'),
    empty: message('meta.ui.fieldPicker.empty', 'No matching fields.'),
    noAvailable: message('meta.ui.fieldPicker.noAvailable', 'No available fields.'),
    allFiltered: message('meta.ui.fieldPicker.allFiltered', 'All fields are already filtered.'),
    allSorted: message('meta.ui.fieldPicker.allSorted', 'All fields are already sorted.')
  },
  toolbar: {
    newView: message('meta.ui.toolbar.newView', 'New view'),
    search: message('meta.ui.toolbar.search', 'Search'),
    filter: message('meta.ui.toolbar.filter', 'Filter'),
    sort: message('meta.ui.toolbar.sort', 'Sort'),
    createView: {
      title: message('meta.ui.toolbar.createView.title', 'Create View'),
      description: message('meta.ui.toolbar.createView.description', 'Add a new view to the current page.'),
      nameLabel: message('meta.ui.toolbar.createView.nameLabel', 'Name'),
      namePlaceholder: message('meta.ui.toolbar.createView.namePlaceholder', 'View name'),
      typeLabel: message('meta.ui.toolbar.createView.typeLabel', 'Type'),
      close: message('meta.ui.toolbar.createView.close', 'Close'),
      create: message('meta.ui.toolbar.createView.create', 'Create')
    },
    filterButton: (count: number) => (
      count === 1
        ? message('meta.ui.toolbar.filterButton.single', 'Filter · 1 filter')
        : message('meta.ui.toolbar.filterButton.multiple', 'Filter · {count} filters', { count })
    ),
    sortButton: (count: number) => (
      count === 1
        ? message('meta.ui.toolbar.sortButton.single', 'Sort · 1 sort')
        : message('meta.ui.toolbar.sortButton.multiple', 'Sort · {count} sorts', { count })
    ),
    settings: (viewType?: ViewType | string) => (
      viewType
        ? message('meta.ui.toolbar.settings.currentView', 'Settings · {view}', {
            view: renderMessage(view.get(viewType).message)
          })
        : message('meta.ui.toolbar.settings.default', 'Settings')
    )
  },
  field: {
    editor: {
      fieldNamePlaceholder: message('meta.ui.field.editor.fieldNamePlaceholder', 'Field name'),
      type: message('meta.ui.field.editor.type', 'Type'),
      format: message('meta.ui.field.editor.format', 'Format'),
      displayFullUrl: message('meta.ui.field.editor.displayFullUrl', 'Show full URL'),
      displayDateFormat: message('meta.ui.field.editor.displayDateFormat', 'Date format'),
      displayTimeFormat: message('meta.ui.field.editor.displayTimeFormat', 'Time format'),
      defaultValueKind: message('meta.ui.field.editor.defaultValueKind', 'Default value'),
      defaultTimezone: message('meta.ui.field.editor.defaultTimezone', 'Default timezone'),
      duplicate: message('meta.ui.field.editor.duplicate', 'Duplicate field'),
      remove: message('meta.ui.field.editor.remove', 'Delete field')
    },
    options: {
      title: message('meta.ui.field.options.title', 'Options'),
      add: message('meta.ui.field.options.add', 'Add option'),
      color: message('meta.ui.field.options.color', 'Color'),
      untitled: message('meta.ui.field.options.untitled', 'Untitled'),
      namePlaceholder: message('meta.ui.field.options.namePlaceholder', 'Option name'),
      remove: message('meta.ui.field.options.remove', 'Delete option'),
      selectOrCreate: (multiple: boolean) => (
        multiple
          ? message('meta.ui.field.options.selectOrCreate.multiple', 'Select or create options')
          : message('meta.ui.field.options.selectOrCreate.single', 'Select or create an option')
      ),
      create: (name: string) => message('meta.ui.field.options.create', 'Create "{name}"', { name }),
      clear: (name: string) => message('meta.ui.field.options.clear', 'Clear {name}', { name }),
      edit: (name: string) => message('meta.ui.field.options.edit', 'Edit {name}', { name }),
      reorder: (name: string) => message('meta.ui.field.options.reorder', 'Reorder {name}', { name })
    },
    status: {
      todo: message('meta.ui.field.status.todo', 'To do'),
      inProgress: message('meta.ui.field.status.inProgress', 'In progress'),
      complete: message('meta.ui.field.status.complete', 'Complete'),
      setDefault: message('meta.ui.field.status.setDefault', 'Set as default'),
      group: message('meta.ui.field.status.group', 'Group'),
      moveTo: message('meta.ui.field.status.moveTo', 'Move to'),
      searchPlaceholder: message('meta.ui.field.status.searchPlaceholder', 'Search options')
    }
  },
  filter: {
    label: message('meta.ui.filter.label', 'Filter'),
    deletedField: message('meta.ui.filter.deletedField', 'Deleted field'),
    remove: message('meta.ui.filter.remove', 'Remove filter'),
    noOptions: message('meta.ui.filter.noOptions', 'No options.'),
    clearSelection: message('meta.ui.filter.clearSelection', 'Clear selection')
  },
  sort: {
    label: message('meta.ui.sort.label', 'Sort'),
    deletedField: message('meta.ui.sort.deletedField', 'Deleted field'),
    add: message('meta.ui.sort.add', 'Add sort'),
    clear: message('meta.ui.sort.clear', 'Delete sorts'),
    remove: message('meta.ui.sort.remove', 'Remove sort'),
    reorder: (name: string) => message('meta.ui.sort.reorder', 'Reorder {name}', { name })
  },
  viewSettings: {
    title: message('meta.ui.viewSettings.title', 'View settings'),
    viewNamePlaceholder: message('meta.ui.viewSettings.viewNamePlaceholder', 'View name'),
    layout: message('meta.ui.viewSettings.layout', 'Layout'),
    visibleFields: message('meta.ui.viewSettings.visibleFields', 'Visible fields'),
    editFields: message('meta.ui.viewSettings.editFields', 'Edit fields'),
    filter: message('meta.ui.viewSettings.filter', 'Filter'),
    sort: message('meta.ui.viewSettings.sort', 'Sort'),
    group: message('meta.ui.viewSettings.group', 'Group'),
    groupField: message('meta.ui.viewSettings.groupField', 'Field'),
    groupMode: message('meta.ui.viewSettings.groupMode', 'Mode'),
    groupByValue: message('meta.ui.viewSettings.groupByValue', 'By value'),
    groupByOption: message('meta.ui.viewSettings.groupByOption', 'By option'),
    groupByRange: message('meta.ui.viewSettings.groupByRange', 'By range'),
    groupByDay: message('meta.ui.viewSettings.groupByDay', 'By day'),
    groupByWeek: message('meta.ui.viewSettings.groupByWeek', 'By week'),
    groupByMonth: message('meta.ui.viewSettings.groupByMonth', 'By month'),
    groupByQuarter: message('meta.ui.viewSettings.groupByQuarter', 'By quarter'),
    groupByYear: message('meta.ui.viewSettings.groupByYear', 'By year'),
    groupByStatus: message('meta.ui.viewSettings.groupByStatus', 'By status'),
    groupByCategory: message('meta.ui.viewSettings.groupByCategory', 'By category'),
    bucketSort: message('meta.ui.viewSettings.bucketSort', 'Group order'),
    bucketInterval: message('meta.ui.viewSettings.bucketInterval', 'Range interval'),
    bucketSortManual: message('meta.ui.viewSettings.bucketSort.manual', 'Manual'),
    bucketSortLabelAsc: message('meta.ui.viewSettings.bucketSort.labelAsc', 'A to Z'),
    bucketSortLabelDesc: message('meta.ui.viewSettings.bucketSort.labelDesc', 'Z to A'),
    bucketSortValueAsc: message('meta.ui.viewSettings.bucketSort.valueAsc', 'Ascending'),
    bucketSortValueDesc: message('meta.ui.viewSettings.bucketSort.valueDesc', 'Descending'),
    none: message('meta.ui.viewSettings.none', 'None'),
    duplicate: message('meta.ui.viewSettings.duplicate', 'Duplicate'),
    remove: message('meta.ui.viewSettings.remove', 'Remove'),
    shown: (count: number) => message('meta.ui.viewSettings.shown', '{count} shown', { count }),
    filterSummary: (
      rules: readonly FilterRule[],
      fields: readonly Field[]
    ) => {
      if (!rules.length) {
        return message('meta.ui.viewSettings.filterSummary.empty', 'No filters')
      }

      if (rules.length > 1) {
        return summarizeCount(
          'meta.ui.viewSettings.filterSummary',
          '1 filter',
          '{count} filters',
          rules.length
        )
      }

      const field = findField(fields, rules[0]?.fieldId)
      return field
        ? message('meta.ui.viewSettings.filterSummary.field', '{field}', { field: field.name })
        : message('meta.ui.viewSettings.filterSummary.single', '1 filter')
    },
    sortSummary: (
      sorters: readonly Sorter[],
      fields: readonly Field[]
    ) => {
      if (!sorters.length) {
        return message('meta.ui.viewSettings.sortSummary.empty', 'Manual')
      }

      if (sorters.length > 1) {
        return summarizeCount(
          'meta.ui.viewSettings.sortSummary',
          '1 sort',
          '{count} sorts',
          sorters.length
        )
      }

      const sorterItem = sorters[0]
      const field = findField(fields, sorterItem?.field)
      if (!field) {
        return message('meta.ui.viewSettings.sortSummary.single', '1 sort')
      }

      return message('meta.ui.viewSettings.sortSummary.field', '{field} · {direction}', {
        field: field.name,
        direction: renderMessage(sort.direction.get(sorterItem.direction).message)
      })
    },
    routeTitle: (kind: SettingsRouteKind) => {
      switch (kind) {
        case 'layout':
          return message('meta.ui.viewSettings.route.layout', 'Layout')
        case 'group':
          return message('meta.ui.viewSettings.route.group', 'Group')
        case 'groupField':
          return message('meta.ui.viewSettings.route.groupField', 'Field')
        case 'viewProperties':
          return message('meta.ui.viewSettings.route.viewProperties', 'Visible fields')
        case 'fieldList':
          return message('meta.ui.viewSettings.route.propertyList', 'Edit fields')
        case 'fieldCreate':
          return message('meta.ui.viewSettings.route.propertyCreate', 'New field')
        case 'fieldSchema':
          return message('meta.ui.viewSettings.route.propertySchema', 'Edit field')
        case 'filter':
          return message('meta.ui.viewSettings.route.filter', 'Filter')
        case 'sort':
          return message('meta.ui.viewSettings.route.sort', 'Sort')
        case 'root':
        default:
          return message('meta.ui.viewSettings.route.root', 'View Settings')
      }
    },
    fieldsPanel: {
      shownIn: (viewType?: ViewType | string) => message(
        'meta.ui.viewSettings.fieldsPanel.shownIn',
        'Shown in {view}',
        {
          view: renderMessage(view.get(viewType).message)
        }
      ),
      hideAll: message('meta.ui.viewSettings.fieldsPanel.hideAll', 'Hide all'),
      add: message('meta.ui.viewSettings.fieldsPanel.add', 'Add field'),
      reorder: (name: string) => message(
        'meta.ui.viewSettings.fieldsPanel.reorder',
        'Reorder {name}',
        { name }
      ),
      hide: (name: string) => message(
        'meta.ui.viewSettings.fieldsPanel.hide',
        'Hide {name}',
        { name }
      ),
      show: (name: string) => message(
        'meta.ui.viewSettings.fieldsPanel.show',
        'Show {name}',
        { name }
      )
    },
    layoutPanel: {
      viewTypeFieldDescription: message(
        'meta.ui.viewSettings.layoutPanel.viewTypeFieldDescription',
        'Choose how this database is presented.'
      ),
      viewTypeOption: (value: LayoutTypeId) => {
        switch (value) {
          case 'gallery':
            return message('meta.ui.viewSettings.layoutPanel.viewTypeOption.gallery', 'Gallery')
          case 'kanban':
            return message('meta.ui.viewSettings.layoutPanel.viewTypeOption.kanban', 'Kanban')
          case 'table':
          default:
            return message('meta.ui.viewSettings.layoutPanel.viewTypeOption.table', 'Table')
        }
      },
      tableTitle: message('meta.ui.viewSettings.layoutPanel.tableTitle', 'Table'),
      tableDescription: message(
        'meta.ui.viewSettings.layoutPanel.tableDescription',
        'Table-specific layout settings will live here.'
      ),
      showVerticalLines: message(
        'meta.ui.viewSettings.layoutPanel.showVerticalLines',
        'Show vertical lines'
      ),
      wrapCells: message(
        'meta.ui.viewSettings.layoutPanel.wrapCells',
        'Wrap cell content'
      ),
      tableInlineStatus: message(
        'meta.ui.viewSettings.layoutPanel.tableInlineStatus',
        'Column widths are edited directly in the table grid.'
      ),
      galleryTitle: message('meta.ui.viewSettings.layoutPanel.galleryTitle', 'Gallery'),
      galleryDescription: message(
        'meta.ui.viewSettings.layoutPanel.galleryDescription',
        'Control how cards render in gallery layout.'
      ),
      showFieldLabels: message(
        'meta.ui.viewSettings.layoutPanel.showFieldLabels',
        'Show field labels'
      ),
      showFieldLabelsDescription: message(
        'meta.ui.viewSettings.layoutPanel.showFieldLabelsDescription',
        'Display field names above each value.'
      ),
      cardSize: message('meta.ui.viewSettings.layoutPanel.cardSize', 'Card size'),
      cardSizeDescription: message(
        'meta.ui.viewSettings.layoutPanel.cardSizeDescription',
        'Adjust the minimum width of gallery cards.'
      ),
      cardSizeOption: (value: CardSizeId) => {
        switch (value) {
          case 'sm':
            return message('meta.ui.viewSettings.layoutPanel.cardSizeOption.sm', 'Small')
          case 'lg':
            return message('meta.ui.viewSettings.layoutPanel.cardSizeOption.lg', 'Large')
          case 'md':
          default:
            return message('meta.ui.viewSettings.layoutPanel.cardSizeOption.md', 'Medium')
        }
      },
      kanbanTitle: message('meta.ui.viewSettings.layoutPanel.kanbanTitle', 'Kanban'),
      kanbanDescription: message(
        'meta.ui.viewSettings.layoutPanel.kanbanDescription',
        'Control how cards behave inside each column.'
      ),
      fillColumnColor: message(
        'meta.ui.viewSettings.layoutPanel.fillColumnColor',
        'Fill column color'
      ),
      cardsPerColumn: message(
        'meta.ui.viewSettings.layoutPanel.cardsPerColumn',
        'Cards per column'
      ),
      cardsPerColumnOption: (value: CardsPerColumnId) => {
        switch (value) {
          case 25:
            return message('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.25', '25')
          case 50:
            return message('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.50', '50')
          case 100:
            return message('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.100', '100')
          case 'all':
          default:
            return message('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.all', 'All')
        }
      },
      newCardPosition: message(
        'meta.ui.viewSettings.layoutPanel.newCardPosition',
        'New card position'
      ),
      newCardPositionDescription: message(
        'meta.ui.viewSettings.layoutPanel.newCardPositionDescription',
        'Choose where newly created cards appear in a column.'
      ),
      newCardPositionOption: (value: NewRecordPositionId) => {
        switch (value) {
          case 'end':
            return message('meta.ui.viewSettings.layoutPanel.newCardPositionOption.end', 'Bottom')
          case 'start':
          default:
            return message('meta.ui.viewSettings.layoutPanel.newCardPositionOption.start', 'Top')
        }
      }
    }
  }
} as const
