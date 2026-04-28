import type {
  MutationEntitySpec
} from '@shared/mutation'

export const dataviewEntities = {
  document: {
    kind: 'singleton',
    members: {
      schemaVersion: 'field',
      activeViewId: 'field',
      meta: 'record'
    },
    change: {
      schemaVersion: ['schemaVersion'],
      activeView: ['activeViewId'],
      meta: ['meta.**']
    }
  },
  record: {
    kind: 'table',
    members: {
      title: 'field',
      type: 'field',
      values: 'record',
      meta: 'record'
    },
    change: {
      title: ['title'],
      kind: ['type'],
      values: ['values.**'],
      meta: ['meta.**']
    }
  },
  field: {
    kind: 'table',
    members: {
      name: 'field',
      kind: 'field',
      system: 'field',
      displayFullUrl: 'field',
      format: 'field',
      precision: 'field',
      currency: 'field',
      useThousandsSeparator: 'field',
      options: 'field',
      defaultOptionId: 'field',
      displayDateFormat: 'field',
      displayTimeFormat: 'field',
      defaultValueKind: 'field',
      defaultTimezone: 'field',
      multiple: 'field',
      accept: 'field',
      meta: 'record'
    },
    change: {
      schema: [
        'name',
        'kind',
        'system',
        'displayFullUrl',
        'format',
        'precision',
        'currency',
        'useThousandsSeparator',
        'options',
        'defaultOptionId',
        'displayDateFormat',
        'displayTimeFormat',
        'defaultValueKind',
        'defaultTimezone',
        'multiple',
        'accept'
      ],
      meta: ['meta.**']
    }
  },
  view: {
    kind: 'table',
    members: {
      name: 'field',
      type: 'field',
      search: 'record',
      filter: 'record',
      sort: 'record',
      calc: 'record',
      display: 'record',
      orders: 'field',
      group: 'record',
      options: 'record'
    },
    change: {
      query: ['name', 'type', 'search.**', 'filter.**', 'sort.**'],
      calc: ['calc.**'],
      layout: ['display.**', 'orders', 'group.**', 'options.**']
    }
  }
} as const satisfies Readonly<Record<string, MutationEntitySpec>>

