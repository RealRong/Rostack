import assert from 'node:assert/strict'
import { test } from 'vitest'
import { filter } from '@dataview/core/filter'
import { compileViewPlan } from '@dataview/engine/active/plan'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { runQueryStage } from '@dataview/engine/active/snapshot/query/runtime'
import { createActiveImpact } from '@dataview/engine/active/shared/impact'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'

const createDocument = (view) => ({
  schemaVersion: 1,
  activeViewId: view.id,
  fields: {
    byId: {
      [FIELD_STATUS]: {
        id: FIELD_STATUS,
        name: 'Status',
        kind: 'status',
        defaultOptionId: 'todo',
        options: [
          {
            id: 'todo',
            name: 'Todo',
            color: 'gray',
            category: 'todo'
          }
        ]
      },
      [FIELD_POINTS]: {
        id: FIELD_POINTS,
        name: 'Points',
        kind: 'number',
        format: 'number',
        precision: null,
        currency: null,
        useThousandsSeparator: false
      }
    },
    order: [FIELD_STATUS, FIELD_POINTS]
  },
  views: {
    byId: {
      [view.id]: view
    },
    order: [view.id]
  },
  records: {
    byId: {
      rec_1: {
        id: 'rec_1',
        title: 'Task 1',
        type: 'task',
        values: {
          [FIELD_STATUS]: 'todo',
          [FIELD_POINTS]: 1
        }
      }
    },
    order: ['rec_1']
  },
  meta: {}
})

const createView = (input = {}) => ({
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
    fields: ['title', FIELD_STATUS, FIELD_POINTS]
  },
  options: {},
  orders: [],
  ...input
})

test('engine.active.query stage reuses previous state when persisted filter change is ineffective', () => {
  const previousView = createView()
  const nextView = createView({
    filter: {
      mode: 'and',
      rules: [{
        fieldId: FIELD_STATUS,
        presetId: 'eq',
        value: filter.value.optionSet.create()
      }]
    }
  })
  const document = createDocument(nextView)
  const context = createStaticDocumentReadContext(document)
  const index = createIndexState(document)
  const previousPlan = compileViewPlan(context.reader, previousView).query
  const nextPlan = compileViewPlan(context.reader, nextView).query
  const previousState = runQueryStage({
    reader: context.reader,
    activeViewId: previousView.id,
    previousViewId: previousView.id,
    impact: createActiveImpact({}),
    view: previousView,
    plan: previousPlan,
    index
  }).state

  const result = runQueryStage({
    reader: context.reader,
    activeViewId: nextView.id,
    previousViewId: nextView.id,
    impact: createActiveImpact({
      views: {
        changed: new Map([
          [nextView.id, {
            queryAspects: new Set(['filter'])
          }]
        ])
      }
    }),
    view: nextView,
    plan: nextPlan,
    previousPlan,
    index,
    previous: previousState,
    previousPublished: previousState.records
  })

  assert.equal(previousPlan.executionKey, nextPlan.executionKey)
  assert.equal(result.action, 'reuse')
  assert.equal(result.state, previousState)
  assert.equal(result.records, previousState.records)
})
