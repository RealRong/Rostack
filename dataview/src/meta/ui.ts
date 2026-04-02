import type {
  GroupProperty,
  GroupFilterRule,
  GroupSorter,
  GroupViewType
} from '@dataview/core/contracts'
import { message, renderMessage, type MessageSpec } from './message'
import { sort } from './sort'
import { view } from './view'

type SettingsRouteKind =
  | 'root'
  | 'layout'
  | 'group'
  | 'viewProperties'
  | 'propertyList'
  | 'propertyCreate'
  | 'propertyEdit'
  | 'filter'
  | 'sort'

type CardSizeId = 'sm' | 'md' | 'lg'
type NewRecordPositionId = 'start' | 'end'

const findProperty = (
  properties: readonly GroupProperty[],
  propertyId: unknown
) => (
  typeof propertyId === 'string'
    ? properties.find(property => property.id === propertyId)
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
    searchPlaceholder: message('meta.ui.fieldPicker.searchPlaceholder', 'Search properties'),
    empty: message('meta.ui.fieldPicker.empty', 'No matching properties.'),
    noAvailable: message('meta.ui.fieldPicker.noAvailable', 'No available properties.'),
    allFiltered: message('meta.ui.fieldPicker.allFiltered', 'All properties are already filtered.'),
    allSorted: message('meta.ui.fieldPicker.allSorted', 'All properties are already sorted.')
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
    settings: (viewType?: GroupViewType | string) => (
      viewType
        ? message('meta.ui.toolbar.settings.currentView', 'Settings · {view}', {
            view: renderMessage(view.get(viewType).message)
          })
        : message('meta.ui.toolbar.settings.default', 'Settings')
    )
  },
  property: {
    editor: {
      propertyNamePlaceholder: message('meta.ui.property.editor.propertyNamePlaceholder', 'Property name'),
      type: message('meta.ui.property.editor.type', 'Type'),
      format: message('meta.ui.property.editor.format', 'Format'),
      displayFullUrl: message('meta.ui.property.editor.displayFullUrl', 'Show full URL'),
      displayDateFormat: message('meta.ui.property.editor.displayDateFormat', 'Date format'),
      displayTimeFormat: message('meta.ui.property.editor.displayTimeFormat', 'Time format'),
      defaultValueKind: message('meta.ui.property.editor.defaultValueKind', 'Default value'),
      defaultTimezone: message('meta.ui.property.editor.defaultTimezone', 'Default timezone'),
      duplicate: message('meta.ui.property.editor.duplicate', 'Duplicate property'),
      remove: message('meta.ui.property.editor.remove', 'Delete property')
    },
    options: {
      title: message('meta.ui.property.options.title', 'Options'),
      add: message('meta.ui.property.options.add', 'Add option'),
      untitled: message('meta.ui.property.options.untitled', 'Untitled'),
      namePlaceholder: message('meta.ui.property.options.namePlaceholder', 'Option name'),
      remove: message('meta.ui.property.options.remove', 'Delete option'),
      selectOrCreate: (multiple: boolean) => (
        multiple
          ? message('meta.ui.property.options.selectOrCreate.multiple', 'Select or create options')
          : message('meta.ui.property.options.selectOrCreate.single', 'Select or create an option')
      ),
      create: (name: string) => message('meta.ui.property.options.create', 'Create "{name}"', { name }),
      clear: (name: string) => message('meta.ui.property.options.clear', 'Clear {name}', { name }),
      edit: (name: string) => message('meta.ui.property.options.edit', 'Edit {name}', { name }),
      reorder: (name: string) => message('meta.ui.property.options.reorder', 'Reorder {name}', { name })
    },
    status: {
      todo: message('meta.ui.property.status.todo', 'To do'),
      inProgress: message('meta.ui.property.status.inProgress', 'In progress'),
      complete: message('meta.ui.property.status.complete', 'Complete'),
      moveTo: message('meta.ui.property.status.moveTo', 'Move to'),
      searchPlaceholder: message('meta.ui.property.status.searchPlaceholder', 'Search options')
    }
  },
  filter: {
    label: message('meta.ui.filter.label', 'Filter'),
    deletedProperty: message('meta.ui.filter.deletedProperty', 'Deleted property'),
    remove: message('meta.ui.filter.remove', 'Remove filter'),
    noOptions: message('meta.ui.filter.noOptions', 'No options.'),
    clearSelection: message('meta.ui.filter.clearSelection', 'Clear selection')
  },
  sort: {
    label: message('meta.ui.sort.label', 'Sort'),
    deletedProperty: message('meta.ui.sort.deletedProperty', 'Deleted property'),
    add: message('meta.ui.sort.add', 'Add sort'),
    clear: message('meta.ui.sort.clear', 'Delete sorts'),
    remove: message('meta.ui.sort.remove', 'Remove sort'),
    reorder: (name: string) => message('meta.ui.sort.reorder', 'Reorder {name}', { name })
  },
  viewSettings: {
    title: message('meta.ui.viewSettings.title', 'View settings'),
    viewNamePlaceholder: message('meta.ui.viewSettings.viewNamePlaceholder', 'View name'),
    layout: message('meta.ui.viewSettings.layout', 'Layout'),
    visibleProperties: message('meta.ui.viewSettings.visibleProperties', 'Visible properties'),
    editProperties: message('meta.ui.viewSettings.editProperties', 'Edit properties'),
    filter: message('meta.ui.viewSettings.filter', 'Filter'),
    sort: message('meta.ui.viewSettings.sort', 'Sort'),
    group: message('meta.ui.viewSettings.group', 'Group'),
    groupProperty: message('meta.ui.viewSettings.groupProperty', 'Property'),
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
      rules: readonly GroupFilterRule[],
      properties: readonly GroupProperty[]
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

      const property = findProperty(properties, rules[0]?.property)
      return property
        ? message('meta.ui.viewSettings.filterSummary.field', '{field}', { field: property.name })
        : message('meta.ui.viewSettings.filterSummary.single', '1 filter')
    },
    sortSummary: (
      sorters: readonly GroupSorter[],
      properties: readonly GroupProperty[]
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
      const property = findProperty(properties, sorterItem?.property)
      if (!property) {
        return message('meta.ui.viewSettings.sortSummary.single', '1 sort')
      }

      return message('meta.ui.viewSettings.sortSummary.field', '{field} · {direction}', {
        field: property.name,
        direction: renderMessage(sort.direction.get(sorterItem.direction).message)
      })
    },
    routeTitle: (kind: SettingsRouteKind) => {
      switch (kind) {
        case 'layout':
          return message('meta.ui.viewSettings.route.layout', 'Layout')
        case 'group':
          return message('meta.ui.viewSettings.route.group', 'Group')
        case 'viewProperties':
          return message('meta.ui.viewSettings.route.viewProperties', 'Visible properties')
        case 'propertyList':
          return message('meta.ui.viewSettings.route.propertyList', 'Edit properties')
        case 'propertyCreate':
          return message('meta.ui.viewSettings.route.propertyCreate', 'New Property')
        case 'propertyEdit':
          return message('meta.ui.viewSettings.route.propertyEdit', 'Edit Property')
        case 'filter':
          return message('meta.ui.viewSettings.route.filter', 'Filter')
        case 'sort':
          return message('meta.ui.viewSettings.route.sort', 'Sort')
        case 'root':
        default:
          return message('meta.ui.viewSettings.route.root', 'View Settings')
      }
    },
    propertiesPanel: {
      shownIn: (viewType?: GroupViewType | string) => message(
        'meta.ui.viewSettings.propertiesPanel.shownIn',
        'Shown in {view}',
        {
          view: renderMessage(view.get(viewType).message)
        }
      ),
      hideAll: message('meta.ui.viewSettings.propertiesPanel.hideAll', 'Hide all'),
      add: message('meta.ui.viewSettings.propertiesPanel.add', 'Add Property'),
      reorder: (name: string) => message(
        'meta.ui.viewSettings.propertiesPanel.reorder',
        'Reorder {name}',
        { name }
      ),
      hide: (name: string) => message(
        'meta.ui.viewSettings.propertiesPanel.hide',
        'Hide {name}',
        { name }
      ),
      show: (name: string) => message(
        'meta.ui.viewSettings.propertiesPanel.show',
        'Show {name}',
        { name }
      )
    },
    layoutPanel: {
      viewType: message('meta.ui.viewSettings.layoutPanel.viewType', 'View type'),
      viewTypeSectionDescription: message(
        'meta.ui.viewSettings.layoutPanel.viewTypeSectionDescription',
        'Switch how this database is presented.'
      ),
      viewTypeFieldDescription: message(
        'meta.ui.viewSettings.layoutPanel.viewTypeFieldDescription',
        'Choose how this database is presented.'
      ),
      tableTitle: message('meta.ui.viewSettings.layoutPanel.tableTitle', 'Table'),
      tableDescription: message(
        'meta.ui.viewSettings.layoutPanel.tableDescription',
        'Table-specific layout settings will live here.'
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
      showPropertyLabels: message(
        'meta.ui.viewSettings.layoutPanel.showFieldLabels',
        'Show field labels'
      ),
      showPropertyLabelsDescription: message(
        'meta.ui.viewSettings.layoutPanel.showFieldLabelsDescription',
        'Display property names above each value.'
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
