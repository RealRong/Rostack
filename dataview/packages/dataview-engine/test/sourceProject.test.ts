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
  projectDocumentDelta
} from '@dataview/engine/mutation/documentDelta'
import { entityTable } from '@shared/core'

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
  return entityTable.normalize.list(fields)
}

const createTableView = () => {
  const fields = createFields()

  return {
    id: VIEW_ID,
    type: 'table',
    name: 'Tasks',
    filter: {
      mode: 'and',
      rules: entityTable.normalize.list([])
    },
    search: {
      query: ''
    },
    sort: {
      rules: entityTable.normalize.list([])
    },
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

  const fieldId = engine.active.table.insertField({
    anchor: FIELD_STATUS,
    side: 'right',
    kind: 'text',
    name: 'Notes'
  })

  assert.ok(fieldId)
  engine.records.fields.set('rec_1', fieldId, 'hello world')

  assert.equal(
    engine.records.get('rec_1')?.values[fieldId],
    'hello world'
  )
})

test('document delta omits list refresh on non-structural value writes', () => {
  const previousDocument = createDocument()
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

  const output = projectDocumentDelta({
    previous: previousDocument,
    next: nextDocument,
    trace: {
      records: {
        touched: new Set(['rec_1'])
      },
      values: {
        touched: new Map([
          ['rec_1', new Set([FIELD_STATUS])]
        ])
      }
    },
  })

  assert.equal(output?.records?.order, undefined)
  assert.deepEqual(output?.records?.set, ['rec_1'])
  assert.deepEqual(output?.records?.remove ?? [], [])
  assert.deepEqual(output?.values?.set, [{
    recordId: 'rec_1',
    fieldId: FIELD_STATUS
  }])
  assert.deepEqual(output?.values?.remove ?? [], [])
})

test('active summary follows snapshot changes without source adapter', () => {
  const engine = createEngine({
    document: createDocument()
  })

  assert.deepEqual(engine.active.state()?.summaries.get('root')?.byField.size, 0)

  engine.active.summary.set(FIELD_STATUS, 'countAll')

  const summary = engine.active.state()?.summaries.get('root')
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
