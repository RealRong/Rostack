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
import {
  projectDocumentDelta
} from '@dataview/engine/mutation/documentDelta'
import {
  applyDocumentDelta,
  createDocumentSourceRuntime,
  resetDocumentSource
} from '@dataview/runtime/source/createDocumentSource'

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

test('document source applies typed ValueRef delta without decode adapters', () => {
  const previous = createDocument(createRecord('todo'))
  const next = createDocument(createRecord('done'))
  const runtime = createDocumentSourceRuntime()

  resetDocumentSource({
    runtime,
    snapshot: {
      doc: previous
    }
  })

  const delta = projectDocumentDelta({
    previous,
    next,
    trace: {
      records: {
        touched: new Set(['rec_1'])
      },
      values: {
        touched: new Map([
          ['rec_1', new Set([FIELD_STATUS])]
        ])
      }
    }
  })

  applyDocumentDelta({
    runtime,
    delta,
    snapshot: {
      doc: next
    }
  })

  assert.equal(
    runtime.source.values.get({
      recordId: 'rec_1',
      fieldId: FIELD_STATUS
    }),
    'done'
  )
  assert.equal(
    runtime.source.records.get('rec_1')?.values[FIELD_STATUS],
    'done'
  )
})
