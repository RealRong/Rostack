import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  TITLE_FIELD_ID,
  type CustomField,
  type DataDoc,
  type DataRecord,
  type View
} from '@dataview/core/types'
import { view } from '@dataview/core/view'
import { entityTable } from '@shared/core'
import { createEngine } from '@dataview/engine'
import { dataviewSpec } from '@dataview/react'

const FIELD_STATUS = 'status'
const VIEW_ID = 'view_table'

const createFields = (): readonly CustomField[] => ([
  {
    id: FIELD_STATUS,
    name: 'Status',
    kind: 'text'
  }
])

const createView = (): View => {
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

const createRecord = (
  status: string
): DataRecord => ({
  id: 'rec_1',
  title: 'Task 1',
  type: 'task',
  values: {
    [FIELD_STATUS]: status
  }
})

const createDocument = (
  record: DataRecord
): DataDoc => ({
  schemaVersion: 1,
  activeViewId: VIEW_ID,
  fields: entityTable.normalize.list(createFields()),
  views: entityTable.normalize.list([createView()]),
  records: entityTable.normalize.list([record]),
  meta: {}
})

test('engine commit keeps typed record value paths without structural record churn', () => {
  const engine = createEngine({
    spec: dataviewSpec,
    document: createDocument(createRecord('todo'))
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
  assert.deepEqual(writes[0]?.delta.changes['record.values'], {
    ids: ['rec_1'],
    paths: {
      rec_1: [`values.${FIELD_STATUS}`]
    }
  })
})
