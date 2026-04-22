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
  createBaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  createItemIdPool
} from '@dataview/engine/active/shared/itemIdPool'
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
  buildMembershipState
} from '@dataview/engine/active/snapshot/membership/derive'
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

  const itemIds = createItemIdPool()
  const published = publishSections({
    view,
    sections: membership.state,
    itemIds
  })

  const todoItemId = published.sections.get('todo')?.itemIds[0]
  assert.equal(
    published.sections.get('todo')?.itemIds[0],
    todoItemId
  )
  assert.equal(typeof todoItemId, 'number')
  assert.equal(todoItemId !== undefined ? published.items.read.record(todoItemId) : undefined, 'rec_1')
  assert.equal(todoItemId !== undefined ? published.items.read.section(todoItemId) : undefined, 'todo')
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
  const itemIds = createItemIdPool()
  const previousPublished = publishSections({
    view,
    sections: previousMembership.state,
    itemIds
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
    previous: previousPublished,
    itemIds
  })

  const previousItemId = previousPublished.sections.get('todo')?.itemIds[0]
  const nextItemId = nextPublished.sections.get('done')?.itemIds.find(
    itemId => nextPublished.items.read.record(itemId) === 'rec_1'
  )

  assert.equal(
    previousItemId !== undefined
      ? nextPublished.items.read.placement(previousItemId)
      : undefined,
    undefined
  )
  assert.equal(nextItemId !== undefined ? nextPublished.items.read.record(nextItemId) : undefined, 'rec_1')
  assert.equal(nextItemId !== undefined ? nextPublished.items.read.section(nextItemId) : undefined, 'done')
  assert.notEqual(previousItemId, nextItemId)
})

test('publishSections emits section and item deltas from published membership changes', () => {
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
  const itemIds = createItemIdPool()
  const previousPublished = publishSections({
    view,
    sections: previousMembership.state,
    itemIds
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
    previous: previousPublished,
    itemIds
  })

  assert.deepEqual(nextPublished.delta?.sections?.update, ['todo', 'done'])
  assert.equal(nextPublished.delta?.sections?.remove, undefined)
  assert.equal(nextPublished.delta?.sections?.list, undefined)
  assert.equal(nextPublished.delta?.items?.update?.length, 1)
  assert.equal(nextPublished.delta?.items?.remove?.length, 1)
  assert.equal(nextPublished.delta?.items?.list, true)
})

test('buildMembershipState reuses grouped partition when visible membership is unchanged', () => {
  const view = createView()
  const document = createDocument({
    rec_1: 'todo',
    rec_2: 'doing'
  })
  const index = createIndexState(document, createDemand(view))
  const query = createQueryState(
    index.rows,
    index.records.ids,
    index.records.ids,
    index.records.ids
  )

  const first = buildMembershipState({
    view,
    query,
    index
  })
  const second = buildMembershipState({
    view,
    query,
    index,
    previous: first
  })

  assert.equal(second.sections, first.sections)
  assert.equal(second.sections.get('todo'), first.sections.get('todo'))
  assert.equal(second.sections.get('doing'), first.sections.get('doing'))
})
