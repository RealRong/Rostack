import type {
  CardLayout,
  CardSize,
  KanbanCardsPerColumn,
  Field,
  FilterRule,
  Sorter,
  ViewType
} from '@dataview/core/contracts'
import { token, type Token } from '@shared/i18n'
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

type CardSizeId = CardSize
type CardLayoutId = CardLayout
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
): Token => (
  count === 1
    ? token(`${key}.single`, singular, { count })
    : token(`${key}.multiple`, plural, { count })
)

export const ui = {
  fieldPicker: {
    searchPlaceholder: token('meta.ui.fieldPicker.searchPlaceholder', 'Search fields'),
    empty: token('meta.ui.fieldPicker.empty', 'No matching fields.'),
    noAvailable: token('meta.ui.fieldPicker.noAvailable', 'No available fields.'),
    allFiltered: token('meta.ui.fieldPicker.allFiltered', 'All fields are already filtered.'),
    allSorted: token('meta.ui.fieldPicker.allSorted', 'All fields are already sorted.')
  },
  toolbar: {
    newView: token('meta.ui.toolbar.newView', 'New view'),
    search: token('meta.ui.toolbar.search', 'Search'),
    filter: token('meta.ui.toolbar.filter', 'Filter'),
    sort: token('meta.ui.toolbar.sort', 'Sort'),
    createView: {
      title: token('meta.ui.toolbar.createView.title', 'Create View'),
      description: token('meta.ui.toolbar.createView.description', 'Add a new view to the current page.'),
      nameLabel: token('meta.ui.toolbar.createView.nameLabel', 'Name'),
      namePlaceholder: token('meta.ui.toolbar.createView.namePlaceholder', 'View name'),
      typeLabel: token('meta.ui.toolbar.createView.typeLabel', 'Type'),
      close: token('meta.ui.toolbar.createView.close', 'Close'),
      create: token('meta.ui.toolbar.createView.create', 'Create')
    },
    filterButton: (count: number) => (
      count === 1
        ? token('meta.ui.toolbar.filterButton.single', 'Filter · 1 filter')
        : token('meta.ui.toolbar.filterButton.multiple', 'Filter · {{count}} filters', { count })
    ),
    sortButton: (count: number) => (
      count === 1
        ? token('meta.ui.toolbar.sortButton.single', 'Sort · 1 sort')
        : token('meta.ui.toolbar.sortButton.multiple', 'Sort · {{count}} sorts', { count })
    ),
    settings: (viewType?: ViewType | string) => (
      viewType
        ? token('meta.ui.toolbar.settings.currentView', 'Settings · {{view}}', {
            view: view.get(viewType).token
          })
        : token('meta.ui.toolbar.settings.default', 'Settings')
    )
  },
  field: {
    editor: {
      fieldNamePlaceholder: token('meta.ui.field.editor.fieldNamePlaceholder', 'Field name'),
      type: token('meta.ui.field.editor.type', 'Type'),
      format: token('meta.ui.field.editor.format', 'Format'),
      displayFullUrl: token('meta.ui.field.editor.displayFullUrl', 'Show full URL'),
      displayDateFormat: token('meta.ui.field.editor.displayDateFormat', 'Date format'),
      displayTimeFormat: token('meta.ui.field.editor.displayTimeFormat', 'Time format'),
      defaultValueKind: token('meta.ui.field.editor.defaultValueKind', 'Default value'),
      defaultTimezone: token('meta.ui.field.editor.defaultTimezone', 'Default timezone'),
      duplicate: token('meta.ui.field.editor.duplicate', 'Duplicate field'),
      remove: token('meta.ui.field.editor.remove', 'Delete field')
    },
    options: {
      title: token('meta.ui.field.options.title', 'Options'),
      add: token('meta.ui.field.options.add', 'Add option'),
      color: token('meta.ui.field.options.color', 'Color'),
      untitled: token('meta.ui.field.options.untitled', 'Untitled'),
      namePlaceholder: token('meta.ui.field.options.namePlaceholder', 'Option name'),
      remove: token('meta.ui.field.options.remove', 'Delete option'),
      selectOrCreate: (multiple: boolean) => (
        multiple
          ? token('meta.ui.field.options.selectOrCreate.multiple', 'Select or create options')
          : token('meta.ui.field.options.selectOrCreate.single', 'Select or create an option')
      ),
      create: (name: string) => token('meta.ui.field.options.create', 'Create "{{name}}"', { name }),
      clear: (name: string) => token('meta.ui.field.options.clear', 'Clear {{name}}', { name }),
      edit: (name: string) => token('meta.ui.field.options.edit', 'Edit {{name}}', { name }),
      reorder: (name: string) => token('meta.ui.field.options.reorder', 'Reorder {{name}}', { name })
    },
    status: {
      todo: token('meta.ui.field.status.todo', 'To do'),
      inProgress: token('meta.ui.field.status.inProgress', 'In progress'),
      complete: token('meta.ui.field.status.complete', 'Complete'),
      setDefault: token('meta.ui.field.status.setDefault', 'Set as default'),
      group: token('meta.ui.field.status.group', 'Group'),
      moveTo: token('meta.ui.field.status.moveTo', 'Move to'),
      searchPlaceholder: token('meta.ui.field.status.searchPlaceholder', 'Search options')
    }
  },
  filter: {
    label: token('meta.ui.filter.label', 'Filter'),
    deletedField: token('meta.ui.filter.deletedField', 'Deleted field'),
    remove: token('meta.ui.filter.remove', 'Remove filter'),
    noOptions: token('meta.ui.filter.noOptions', 'No options.'),
    clearSelection: token('meta.ui.filter.clearSelection', 'Clear selection')
  },
  sort: {
    label: token('meta.ui.sort.label', 'Sort'),
    deletedField: token('meta.ui.sort.deletedField', 'Deleted field'),
    add: token('meta.ui.sort.add', 'Add sort'),
    clear: token('meta.ui.sort.clear', 'Delete sorts'),
    remove: token('meta.ui.sort.remove', 'Remove sort'),
    reorder: (name: string) => token('meta.ui.sort.reorder', 'Reorder {{name}}', { name })
  },
  viewSettings: {
    title: token('meta.ui.viewSettings.title', 'View settings'),
    viewNamePlaceholder: token('meta.ui.viewSettings.viewNamePlaceholder', 'View name'),
    layout: token('meta.ui.viewSettings.layout', 'Layout'),
    visibleFields: token('meta.ui.viewSettings.visibleFields', 'Visible fields'),
    editFields: token('meta.ui.viewSettings.editFields', 'Edit fields'),
    filter: token('meta.ui.viewSettings.filter', 'Filter'),
    sort: token('meta.ui.viewSettings.sort', 'Sort'),
    group: token('meta.ui.viewSettings.group', 'Group'),
    groupField: token('meta.ui.viewSettings.groupField', 'Field'),
    groupMode: token('meta.ui.viewSettings.groupMode', 'Mode'),
    groupByValue: token('meta.ui.viewSettings.groupByValue', 'By value'),
    groupByOption: token('meta.ui.viewSettings.groupByOption', 'By option'),
    groupByRange: token('meta.ui.viewSettings.groupByRange', 'By range'),
    groupByDay: token('meta.ui.viewSettings.groupByDay', 'By day'),
    groupByWeek: token('meta.ui.viewSettings.groupByWeek', 'By week'),
    groupByMonth: token('meta.ui.viewSettings.groupByMonth', 'By month'),
    groupByQuarter: token('meta.ui.viewSettings.groupByQuarter', 'By quarter'),
    groupByYear: token('meta.ui.viewSettings.groupByYear', 'By year'),
    groupByStatus: token('meta.ui.viewSettings.groupByStatus', 'By status'),
    groupByCategory: token('meta.ui.viewSettings.groupByCategory', 'By category'),
    bucketSort: token('meta.ui.viewSettings.bucketSort', 'Group order'),
    bucketInterval: token('meta.ui.viewSettings.bucketInterval', 'Range interval'),
    bucketSortManual: token('meta.ui.viewSettings.bucketSort.manual', 'Manual'),
    bucketSortLabelAsc: token('meta.ui.viewSettings.bucketSort.labelAsc', 'A to Z'),
    bucketSortLabelDesc: token('meta.ui.viewSettings.bucketSort.labelDesc', 'Z to A'),
    bucketSortValueAsc: token('meta.ui.viewSettings.bucketSort.valueAsc', 'Ascending'),
    bucketSortValueDesc: token('meta.ui.viewSettings.bucketSort.valueDesc', 'Descending'),
    none: token('meta.ui.viewSettings.none', 'None'),
    duplicate: token('meta.ui.viewSettings.duplicate', 'Duplicate'),
    remove: token('meta.ui.viewSettings.remove', 'Remove'),
    shown: (count: number) => token('meta.ui.viewSettings.shown', '{{count}} shown', { count }),
    filterSummary: (
      rules: readonly FilterRule[],
      fields: readonly Field[]
    ) => {
      if (!rules.length) {
        return token('meta.ui.viewSettings.filterSummary.empty', 'No filters')
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
        ? token('meta.ui.viewSettings.filterSummary.field', '{{field}}', { field: field.name })
        : token('meta.ui.viewSettings.filterSummary.single', '1 filter')
    },
    sortSummary: (
      sorters: readonly Sorter[],
      fields: readonly Field[]
    ) => {
      if (!sorters.length) {
        return token('meta.ui.viewSettings.sortSummary.empty', 'Manual')
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
        return token('meta.ui.viewSettings.sortSummary.single', '1 sort')
      }

      return token('meta.ui.viewSettings.sortSummary.field', '{{field}} · {{direction}}', {
        field: field.name,
        direction: sort.direction.get(sorterItem.direction).token
      })
    },
    routeTitle: (kind: SettingsRouteKind) => {
      switch (kind) {
        case 'layout':
          return token('meta.ui.viewSettings.route.layout', 'Layout')
        case 'group':
          return token('meta.ui.viewSettings.route.group', 'Group')
        case 'groupField':
          return token('meta.ui.viewSettings.route.groupField', 'Field')
        case 'viewProperties':
          return token('meta.ui.viewSettings.route.viewProperties', 'Visible fields')
        case 'fieldList':
          return token('meta.ui.viewSettings.route.propertyList', 'Edit fields')
        case 'fieldCreate':
          return token('meta.ui.viewSettings.route.propertyCreate', 'New field')
        case 'fieldSchema':
          return token('meta.ui.viewSettings.route.propertySchema', 'Edit field')
        case 'filter':
          return token('meta.ui.viewSettings.route.filter', 'Filter')
        case 'sort':
          return token('meta.ui.viewSettings.route.sort', 'Sort')
        case 'root':
        default:
          return token('meta.ui.viewSettings.route.root', 'View Settings')
      }
    },
    fieldsPanel: {
      shownIn: (viewType?: ViewType | string) => token(
        'meta.ui.viewSettings.fieldsPanel.shownIn',
        'Shown in {{view}}',
        {
          view: view.get(viewType).token
        }
      ),
      hideAll: token('meta.ui.viewSettings.fieldsPanel.hideAll', 'Hide all'),
      add: token('meta.ui.viewSettings.fieldsPanel.add', 'Add field'),
      reorder: (name: string) => token(
        'meta.ui.viewSettings.fieldsPanel.reorder',
        'Reorder {name}',
        { name }
      ),
      hide: (name: string) => token(
        'meta.ui.viewSettings.fieldsPanel.hide',
        'Hide {name}',
        { name }
      ),
      show: (name: string) => token(
        'meta.ui.viewSettings.fieldsPanel.show',
        'Show {name}',
        { name }
      )
    },
    layoutPanel: {
      viewTypeFieldDescription: token(
        'meta.ui.viewSettings.layoutPanel.viewTypeFieldDescription',
        'Choose how this database is presented.'
      ),
      viewTypeOption: (value: LayoutTypeId) => {
        switch (value) {
          case 'gallery':
            return token('meta.ui.viewSettings.layoutPanel.viewTypeOption.gallery', 'Gallery')
          case 'kanban':
            return token('meta.ui.viewSettings.layoutPanel.viewTypeOption.kanban', 'Kanban')
          case 'table':
          default:
            return token('meta.ui.viewSettings.layoutPanel.viewTypeOption.table', 'Table')
        }
      },
      tableTitle: token('meta.ui.viewSettings.layoutPanel.tableTitle', 'Table'),
      tableDescription: token(
        'meta.ui.viewSettings.layoutPanel.tableDescription',
        'Table-specific layout settings will live here.'
      ),
      showVerticalLines: token(
        'meta.ui.viewSettings.layoutPanel.showVerticalLines',
        'Show vertical lines'
      ),
      wrap: token(
        'meta.ui.viewSettings.layoutPanel.wrap',
        'Wrap content'
      ),
      tableInlineStatus: token(
        'meta.ui.viewSettings.layoutPanel.tableInlineStatus',
        'Column widths are edited directly in the table grid.'
      ),
      galleryTitle: token('meta.ui.viewSettings.layoutPanel.galleryTitle', 'Gallery'),
      galleryDescription: token(
        'meta.ui.viewSettings.layoutPanel.galleryDescription',
        'Control how cards render in gallery layout.'
      ),
      cardSize: token('meta.ui.viewSettings.layoutPanel.cardSize', 'Card size'),
      cardSizeDescription: token(
        'meta.ui.viewSettings.layoutPanel.cardSizeDescription',
        'Adjust the card density and recommended width.'
      ),
      cardSizeOption: (value: CardSizeId) => {
        switch (value) {
          case 'sm':
            return token('meta.ui.viewSettings.layoutPanel.cardSizeOption.sm', 'Small')
          case 'lg':
            return token('meta.ui.viewSettings.layoutPanel.cardSizeOption.lg', 'Large')
          case 'md':
          default:
            return token('meta.ui.viewSettings.layoutPanel.cardSizeOption.md', 'Medium')
        }
      },
      cardLayout: token('meta.ui.viewSettings.layoutPanel.cardLayout', 'Layout'),
      cardLayoutOption: (value: CardLayoutId) => {
        switch (value) {
          case 'compact':
            return token('meta.ui.viewSettings.layoutPanel.cardLayoutOption.compact', 'Compact')
          case 'stacked':
          default:
            return token('meta.ui.viewSettings.layoutPanel.cardLayoutOption.stacked', 'Stacked')
        }
      },
      kanbanTitle: token('meta.ui.viewSettings.layoutPanel.kanbanTitle', 'Kanban'),
      kanbanDescription: token(
        'meta.ui.viewSettings.layoutPanel.kanbanDescription',
        'Control how cards behave inside each column.'
      ),
      fillColumnColor: token(
        'meta.ui.viewSettings.layoutPanel.fillColumnColor',
        'Fill column color'
      ),
      cardsPerColumn: token(
        'meta.ui.viewSettings.layoutPanel.cardsPerColumn',
        'Cards per column'
      ),
      cardsPerColumnOption: (value: CardsPerColumnId) => {
        switch (value) {
          case 25:
            return token('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.25', '25')
          case 50:
            return token('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.50', '50')
          case 100:
            return token('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.100', '100')
          case 'all':
          default:
            return token('meta.ui.viewSettings.layoutPanel.cardsPerColumnOption.all', 'All')
        }
      },
    }
  }
} as const
