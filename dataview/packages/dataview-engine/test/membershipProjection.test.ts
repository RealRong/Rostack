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
  createItemId
} from '@dataview/engine/active/shared/itemId'
import {
  createBaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  createMembershipTransition
} from '@dataview/engine/active/shared/transition'
import {
  createSelectionFromIds
} from '@dataview/engine/active/shared/selection'
import {
  publishSections
} from '@dataview/engine/active/snapshot/membership/publish'
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
  rows,
  matched: readonly string[],
  ordered: readonly string[],
  visible: readonly string[]
): QueryState => ({
  matched: createSelectionFromIds({
    rows,
    ids: matched
  }),
  ordered: createSelectionFromIds({
    rows,
    ids: ordered
  }),
  visible: createSelectionFromIds({
    rows,
    ids: visible
  })
})

const EMPTY_QUERY_DELTA = {
  rebuild: false,
  added: [],
  removed: [],
  orderChanged: false
} as const

test('publishSections uses deterministic item ids derived from section and record', () => {
  const view = createView()
  const document = createDocument({
    rec_1: 'todo',
    rec_2: 'doing'
  })
  const index = createIndexState(document, createDemand(view))
  const membership = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createBaseImpact({}),
    view,
    query: createQueryState(
      index.rows,
      index.records.ids,
      index.records.ids,
      index.records.ids
    ),
    queryDelta: EMPTY_QUERY_DELTA,
    index
  })

  const published = publishSections({
    view,
    sections: membership.state
  })

  const todoItemId = createItemId('todo', 'rec_1')
  assert.equal(
    published.sections.get('todo')?.items.ids[0],
    todoItemId
  )
  assert.deepEqual(
    published.items.get(todoItemId),
    {
      id: todoItemId,
      recordId: 'rec_1',
      sectionKey: 'todo'
    }
  )
})

test('publishSections changes item id when a record moves to another group', () => {
  const view = createView()
  const previousDocument = createDocument({
    rec_1: 'todo',
    rec_2: 'doing'
  })
  const previousIndex = createIndexState(previousDocument, createDemand(view))
  const previousMembership = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createBaseImpact({}),
    view,
    query: createQueryState(
      previousIndex.rows,
      previousIndex.records.ids,
      previousIndex.records.ids,
      previousIndex.records.ids
    ),
    queryDelta: EMPTY_QUERY_DELTA,
    index: previousIndex
  })
  const previousPublished = publishSections({
    view,
    sections: previousMembership.state
  })

  const nextDocument = createDocument({
    rec_1: 'done',
    rec_2: 'doing'
  })
  const nextIndex = createIndexState(nextDocument, createDemand(view))
  const impact = createBaseImpact({})
  impact.touchedFields = new Set([FIELD_STATUS])
  const bucketDelta = createMembershipTransition<string, string>()
  bucketDelta.records.set('rec_1', {
    before: ['todo'],
    after: ['done']
  })

  const nextMembership = runMembershipStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact,
    view,
    query: createQueryState(
      nextIndex.rows,
      nextIndex.records.ids,
      nextIndex.records.ids,
      nextIndex.records.ids
    ),
    queryDelta: EMPTY_QUERY_DELTA,
    previous: previousMembership.state,
    index: nextIndex,
    indexDelta: {
      bucket: bucketDelta
    }
  })
  const nextPublished = publishSections({
    view,
    sections: nextMembership.state,
    previousSections: previousMembership.state,
    previous: previousPublished
  })

  const previousItemId = createItemId('todo', 'rec_1')
  const nextItemId = createItemId('done', 'rec_1')

  assert.equal(
    nextPublished.items.get(previousItemId),
    undefined
  )
  assert.deepEqual(
    nextPublished.items.get(nextItemId),
    {
      id: nextItemId,
      recordId: 'rec_1',
      sectionKey: 'done'
    }
  )
})
