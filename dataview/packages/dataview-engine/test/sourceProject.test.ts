import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  view
} from '@dataview/core/view'
import { createEngine } from '@dataview/engine'
import { dataviewSpec } from '@dataview/react'
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
      ids: [tableView.id]
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
      ids: ['rec_1']
    },
    meta: {}
  }
}

test('engine source records refresh after writing a value into a newly inserted field', () => {
  const engine = createEngine({
    spec: dataviewSpec,
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

test('engine commit exposes normalized MutationDelta for non-structural value writes', () => {
  const engine = createEngine({
    spec: dataviewSpec,
    document: createDocument()
  })
  const writes = []
  const unsubscribe = engine.commits.subscribe((commit) => {
    if (commit.kind === 'apply') {
      writes.push(commit)
    }
  })

  engine.records.fields.set('rec_1', FIELD_STATUS, 'done')
  unsubscribe()

  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0]?.delta, {
    changes: {
      'record.values': {
        paths: {
          rec_1: [FIELD_STATUS]
        }
      }
    }
  })
})

test('active summary follows snapshot changes without source adapter', () => {
  const engine = createEngine({
    spec: dataviewSpec,
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
