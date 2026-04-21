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

test('source summary follows snapshot changes without active patch', () => {
  const engine = createEngine({
    document: createDocument()
  })

  assert.deepEqual(
    engine.source.active.sections.summary.get('root')?.byField.size,
    0
  )

  engine.active.summary.set(FIELD_STATUS, 'countAll')

  const summary = engine.source.active.sections.summary.get('root')
  assert.ok(summary)
  assert.deepEqual(
    summary.get(FIELD_STATUS),
    {
      kind: 'scalar',
      metric: 'countAll',
      value: 1
    }
  )
})
