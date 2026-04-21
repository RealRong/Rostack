import assert from 'node:assert/strict'
import type {
  DataDoc,
  View
} from '@dataview/core/contracts'
import { test } from 'vitest'
import {
  createBucketSpec
} from '@dataview/engine/active/index/bucket'
import type {
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import {
  createIndexState
} from '@dataview/engine/active/index/runtime'
import {
  createActiveImpact,
  ensureQueryImpact,
  ensureBucketTransition
} from '@dataview/engine/active/shared/impact'
import {
  createSectionRecordKey
} from '@dataview/engine/active/shared/itemIdentity'
import {
  runMembershipStage
} from '@dataview/engine/active/snapshot/membership/runtime'
import type {
  QueryState
} from '@dataview/engine/contracts/state'

const FIELD_STATUS = 'status'
const VIEW_ID = 'view_table'

const createView = (): View => ({
  id: VIEW_ID,
  type: 'table',
  name: 'Tasks',
  search: {
    query: ''
  },
  filter: {
    mode: 'and',
    rules: []
  },
  sort: [],
  group: {
    field: FIELD_STATUS,
    mode: 'option',
    bucketSort: 'manual',
    showEmpty: true
  },
  calc: {},
  display: {
    fields: [FIELD_STATUS]
  },
  options: {},
  orders: []
})

const createDocument = (
  statuses: Readonly<Record<string, string>>
): DataDoc => ({
  schemaVersion: 1,
  activeViewId: VIEW_ID,
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
      }
    },
    order: [FIELD_STATUS]
  },
  views: {
    byId: {
      [VIEW_ID]: createView()
    },
    order: [VIEW_ID]
  },
  records: {
    byId: Object.fromEntries(
      Object.entries(statuses).map(([recordId, status]) => [
        recordId,
        {
          id: recordId,
          title: recordId,
          type: 'task',
          values: {
            [FIELD_STATUS]: status
          }
        }
      ])
    ),
    order: Object.keys(statuses)
  },
  meta: {}
})

const createDemand = (
  view: View
): NormalizedIndexDemand => ({
  recordFields: [FIELD_STATUS],
  search: [],
  buckets: view.group
    ? [createBucketSpec(view.group)]
    : [],
  sortFields: [],
  calculations: []
})

const createQueryState = (
  matched: readonly string[],
  ordered: readonly string[],
  visible: readonly string[]
): QueryState => ({
  records: {
    matched,
    ordered,
    visible
  }
})

test('membership stage reuses grouped projection when only query visibility changes', () => {
  const view = createView()
  const document = createDocument({
    rec_1: 'todo',
    rec_2: 'doing',
    rec_3: 'done'
  })
  const index = createIndexState(document, createDemand(view))
  const previous = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createActiveImpact({}),
    view,
    query: createQueryState(
      index.records.ids,
      index.records.ids,
      index.records.ids
    ),
    index
  })
  const impact = createActiveImpact({})
  ensureQueryImpact(impact).visibleRemoved.push('rec_1', 'rec_2')

  const next = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact,
    view,
    query: createQueryState(
      index.records.ids,
      index.records.ids,
      ['rec_3']
    ),
    previous: previous.state,
    index
  })

  assert.equal(next.action, 'sync')
  assert.equal(next.state.projection, previous.state.projection)
})

test('membership stage syncs grouped projection when bucket membership changes', () => {
  const view = createView()
  const previousDocument = createDocument({
    rec_1: 'todo',
    rec_2: 'doing',
    rec_3: 'done'
  })
  const previousIndex = createIndexState(previousDocument, createDemand(view))
  const previous = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createActiveImpact({}),
    view,
    query: createQueryState(
      previousIndex.records.ids,
      previousIndex.records.ids,
      previousIndex.records.ids
    ),
    index: previousIndex
  })
  const nextDocument = createDocument({
    rec_1: 'done',
    rec_2: 'doing',
    rec_3: 'done'
  })
  const nextIndex = createIndexState(nextDocument, createDemand(view))
  const impact = createActiveImpact({})
  impact.base.touchedFields = new Set([FIELD_STATUS])
  ensureBucketTransition(impact).records.set('rec_1', {
    before: ['todo'],
    after: ['done']
  })

  const next = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact,
    view,
    query: createQueryState(
      nextIndex.records.ids,
      nextIndex.records.ids,
      nextIndex.records.ids
    ),
    previous: previous.state,
    index: nextIndex
  })

  assert.equal(next.action, 'sync')
  assert.notEqual(next.state.projection, previous.state.projection)
  assert.equal(
    next.state.projection.bySectionRecord.has(
      createSectionRecordKey('todo', 'rec_1')
    ),
    false
  )
  assert.equal(
    next.state.projection.bySectionRecord.has(
      createSectionRecordKey('done', 'rec_1')
    ),
    true
  )
})
