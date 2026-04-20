import {
  view,
  TITLE_FIELD_ID
} from '@dataview/engine/bench/runtime'

const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'
const FIELD_ESTIMATE = 'estimate'
const VIEW_TABLE = 'view_table'

const SIZE_TO_COUNT = {
  small: 1000,
  medium: 10000,
  large: 50000,
  xlarge: 100000
}

const STATUS_OPTIONS = [
  {
    id: 'todo',
    name: 'Todo',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'doing',
    name: 'Doing',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
  }
]

const createFields = () => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'status',
    defaultOptionId: 'todo',
    options: STATUS_OPTIONS.map(option => ({ ...option }))
  },
  {
    id: FIELD_POINTS,
    name: 'Points',
    kind: 'number',
    format: 'number',
    precision: null,
    currency: null,
    useThousandsSeparator: false
  },
  {
    id: FIELD_ESTIMATE,
    name: 'Estimate',
    kind: 'number',
    format: 'number',
    precision: null,
    currency: null,
    useThousandsSeparator: false
  }
])

const createFieldTable = (fields) => {
  const byId = {}

  fields.forEach(field => {
    byId[field.id] = field
  })

  return {
    byId,
    order: fields.map(field => field.id)
  }
}

const padRecordNumber = (value: number) => String(value).padStart(6, '0')

const createRecordId = (index: number) => `rec_${padRecordNumber(index + 1)}`

const createDocument = (recordCount: number) => {
  const fields = createFields()
  const recordsById = {}
  const recordOrder = []

  for (let index = 0; index < recordCount; index += 1) {
    const recordId = createRecordId(index)
    recordOrder.push(recordId)
    recordsById[recordId] = {
      id: recordId,
      title: `Task ${padRecordNumber(index + 1)}`,
      type: 'task',
      values: {
        [FIELD_STATUS]: STATUS_OPTIONS[index % STATUS_OPTIONS.length].id,
        [FIELD_POINTS]: (index % 100) + 1,
        [FIELD_ESTIMATE]: (index % 50) + 1
      }
    }
  }

  return {
    schemaVersion: 1,
    activeViewId: VIEW_TABLE,
    fields: createFieldTable(fields),
    views: {
      byId: {
        [VIEW_TABLE]: {
          id: VIEW_TABLE,
          type: 'table',
          name: 'Tasks',
          filter: {
            mode: 'and',
            rules: []
          },
          search: {
            query: ''
          },
          sort: [],
          calc: {},
          display: {
            fields: [TITLE_FIELD_ID, FIELD_STATUS, FIELD_POINTS, FIELD_ESTIMATE]
          },
          options: {
            ...view.options.defaults('table', fields)
          },
          orders: []
        }
      },
      order: [VIEW_TABLE]
    },
    records: {
      byId: recordsById,
      order: recordOrder
    },
    meta: {}
  }
}

const createFixture = (size: keyof typeof SIZE_TO_COUNT) => {
  const recordCount = SIZE_TO_COUNT[size]
  if (!recordCount) {
    throw new Error(`Unknown fixture size: ${size}`)
  }

  const middle = Math.floor(recordCount / 2)
  const batchCount = Math.min(
    Math.max(Math.floor(recordCount / 20), 100),
    5000
  )

  return {
    size,
    recordCount,
    document: createDocument(recordCount),
    ids: {
      target: createRecordId(middle),
      groupTarget: createRecordId(0),
      search: createRecordId(Math.floor(recordCount / 3)),
      batch: Array.from({ length: batchCount }, (_value, index) => createRecordId(index))
    },
    fields: {
      status: FIELD_STATUS,
      points: FIELD_POINTS,
      estimate: FIELD_ESTIMATE,
      title: TITLE_FIELD_ID
    },
    viewId: VIEW_TABLE
  }
}

export {
  SIZE_TO_COUNT,
  STATUS_OPTIONS,
  VIEW_TABLE,
  createFixture
}
