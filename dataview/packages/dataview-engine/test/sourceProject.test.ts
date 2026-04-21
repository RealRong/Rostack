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
  projectDocumentChange,
  projectEngineOutput
} from '@dataview/engine/source/project'

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

  const documentChange = projectDocumentChange({
    impact: {
      records: {
        touched: new Set(['rec_1']),
        valueChangedFields: new Set([FIELD_STATUS])
      }
    },
    document: nextDocument
  })

  assert.deepEqual(documentChange.records.changed, ['rec_1'])
  assert.equal(documentChange.records.idsChanged, false)

  const output = projectEngineOutput({
    document: nextDocument,
    documentChange,
    previousLayout: null
  })

  assert.equal(output.sourceDelta.document?.records?.ids, undefined)
  assert.deepEqual(
    output.sourceDelta.document?.records?.values?.set
      ? [...output.sourceDelta.document.records.values.set]
      : [],
    [['rec_1', nextDocument.records.byId.rec_1]]
  )
})
