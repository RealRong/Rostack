import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  view
} from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import {
  buildActivePatch
} from '@dataview/engine/active/snapshot/publish/patch'
import {
  projectDocumentPatch
} from '@dataview/engine/source/document'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'

const createFields = () => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'text'
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

const createTableView = () => {
  const fields = createFields()

  return {
    id: VIEW_ID,
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
      fields: [TITLE_FIELD_ID, FIELD_STATUS]
    },
    options: {
      ...view.options.defaults('table', fields)
    },
    orders: []
  }
}

const createDocument = () => {
  const fields = createFields()
  const tableView = createTableView()

  return {
    schemaVersion: 1,
    activeViewId: tableView.id,
    fields: createFieldTable(fields),
    views: {
      byId: {
        [tableView.id]: tableView
      },
      order: [tableView.id]
    },
    records: {
      byId: {
        rec_1: {
          id: 'rec_1',
          title: 'Task 1',
          type: 'task',
          values: {
            [FIELD_STATUS]: 'todo'
          }
        }
      },
      order: ['rec_1']
    },
    meta: {}
  }
}

const createCalculationCollection = (
  value: number
) => {
  const byField = new Map([
    [FIELD_STATUS, {
      kind: 'scalar' as const,
      metric: 'countAll' as const,
      value
    }]
  ])

  return {
    byField,
    get: (fieldId: string) => byField.get(fieldId)
  }
}

test('engine source records refresh after writing a value into a newly inserted field', () => {
  const engine = createEngine({
    document: createDocument()
  })

  const fieldId = engine.active.table.insertFieldRight(FIELD_STATUS, {
    kind: 'text',
    name: 'Notes'
  })

  assert.ok(fieldId)
  engine.records.fields.set('rec_1', fieldId, 'hello world')

  assert.equal(
    engine.source.doc.records.get('rec_1')?.values[fieldId],
    'hello world'
  )
})

test('document publish omits record ids on non-structural value writes', () => {
  const document = createDocument()
  const nextDocument = {
    ...document,
    records: {
      ...document.records,
      byId: {
        ...document.records.byId,
        rec_1: {
          ...document.records.byId.rec_1,
          values: {
            ...document.records.byId.rec_1.values,
            [FIELD_STATUS]: 'done'
          }
        }
      }
    }
  }

  const output = projectDocumentPatch({
    impact: {
      records: {
        touched: new Set(['rec_1']),
        valueChangedFields: new Set([FIELD_STATUS])
      }
    },
    document: nextDocument
  })

  assert.equal(output?.records?.ids, undefined)
  assert.deepEqual(
    output?.records?.set
      ? [...output.records.set]
      : [],
    [['rec_1', nextDocument.records.byId.rec_1]]
  )
})

test('active summary delta follows published summaries even when section structure is unchanged', () => {
  const engine = createEngine({
    document: createDocument()
  })
  const previous = engine.active.state.get()

  assert.ok(previous)

  const sectionKey = previous.sections.ids[0]
  assert.equal(sectionKey, 'root')

  const nextCollection = createCalculationCollection(42)
  const next = {
    ...previous,
    summaries: new Map([
      ...previous.summaries,
      [sectionKey, nextCollection]
    ])
  }

  const output = buildActivePatch({
    previous,
    next
  })

  assert.deepEqual(output?.sections?.summary?.ids, undefined)
  assert.deepEqual(
    output?.sections?.summary?.set
      ? [...output.sections.summary.set]
      : [],
    [[sectionKey, nextCollection]]
  )
})
