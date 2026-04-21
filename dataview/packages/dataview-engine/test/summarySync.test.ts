import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  calculation
} from '@dataview/core/calculation'
import {
  createActiveImpact,
  ensureQueryImpact
} from '@dataview/engine/active/shared/impact'
import {
  runSummaryStage
} from '@dataview/engine/active/snapshot/summary/runtime'
import {
  deriveSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'
import type {
  View
} from '@dataview/core/contracts'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  MembershipDelta,
  MembershipState
} from '@dataview/engine/contracts/state'

const FIELD_POINTS = 'points'
const FIELD_STATUS = 'status'
const ROOT_SECTION = 'root'
const VIEW_ID = 'view_table'

const createMembershipState = (
  recordIds: readonly string[]
): MembershipState => ({
  order: [ROOT_SECTION],
  byKey: new Map([
    [ROOT_SECTION, {
      key: ROOT_SECTION,
      label: ROOT_SECTION as never,
      collapsed: false,
      visible: true,
      recordIds
    }]
  ]),
  keysByRecord: new Map(recordIds.map(recordId => [recordId, [ROOT_SECTION]] as const))
})

const createGroupedMembershipState = (
  sections: Readonly<Record<string, readonly string[]>>
): MembershipState => {
  const order = Object.keys(sections)
  const byKey = new Map(order.map(sectionKey => [
    sectionKey,
    {
      key: sectionKey,
      label: sectionKey as never,
      recordIds: sections[sectionKey] ?? []
    }
  ] as const))
  const keysByRecord = new Map<string, string[]>()

  order.forEach(sectionKey => {
    sections[sectionKey]?.forEach(recordId => {
      const keys = keysByRecord.get(recordId) ?? []
      if (!keysByRecord.has(recordId)) {
        keysByRecord.set(recordId, keys)
      }
      keys.push(sectionKey)
    })
  })

  return {
    order,
    byKey,
    keysByRecord
  }
}

const createView = (
  input: Partial<View> = {}
): View => ({
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
  calc: {
    [FIELD_POINTS]: 'count'
  },
  display: {
    fields: ['title', FIELD_STATUS, FIELD_POINTS]
  },
  options: {},
  orders: [],
  ...input
})

const EMPTY_MEMBERSHIP_DELTA: MembershipDelta = {
  rebuild: false,
  orderChanged: false,
  changed: [],
  removed: [],
  records: new Map()
}

const createIndexState = (): IndexState => ({
  calculations: {
    fields: new Map([
      [FIELD_POINTS, {
        fieldId: FIELD_POINTS,
        capabilities: {
          count: true
        },
        entries: new Map([
          ['rec_1', calculation.entry.create({
            field: undefined,
            value: 1,
            capabilities: {
              count: true
            }
          })],
          ['rec_2', calculation.entry.create({
            field: undefined,
            value: 2,
            capabilities: {
              count: true
            }
          })]
        ]),
        global: calculation.state.empty({
          count: true
        })
      }]
    ]),
    rev: 0
  }
} as unknown as IndexState)

test('summary sync rebuilds section aggregates when section record ids change without section transitions', () => {
  const index = createIndexState()
  const previousMembership = createMembershipState(['rec_1', 'rec_2'])
  const previous = deriveSummaryState({
    membership: previousMembership,
    calcFields: [FIELD_POINTS],
    index,
    impact: createActiveImpact({}),
    action: 'rebuild'
  }).state

  const nextMembership = createMembershipState([])
  const impact = createActiveImpact({})
  ensureQueryImpact(impact).visibleRemoved.push('rec_1', 'rec_2')

  const next = deriveSummaryState({
    previous,
    previousMembership,
    membership: nextMembership,
    calcFields: [FIELD_POINTS],
    index,
    impact,
    action: 'sync'
  })

  assert.notEqual(next.state, previous)
  assert.deepEqual(next.delta.changed, [ROOT_SECTION])
  assert.equal(
    next.state.bySection.get(ROOT_SECTION)?.get(FIELD_POINTS)?.count?.count,
    0
  )
})

test('summary stage syncs when membership changes without record transitions', () => {
  const index = createIndexState()
  const previousMembership = createGroupedMembershipState({
    todo: ['rec_1'],
    done: ['rec_2']
  })
  const previous = deriveSummaryState({
    membership: previousMembership,
    calcFields: [FIELD_POINTS],
    index,
    impact: createActiveImpact({}),
    action: 'rebuild'
  }).state

  const nextMembership = createGroupedMembershipState({
    todo: [],
    done: []
  })
  const view = createView({
    group: {
      field: FIELD_STATUS,
      mode: 'option',
      bucketSort: 'manual'
    }
  })
  const result = runSummaryStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createActiveImpact({}),
    view,
    calcFields: [FIELD_POINTS],
    previous,
    previousMembership,
    membership: nextMembership,
    membershipAction: 'sync',
    membershipDelta: {
      ...EMPTY_MEMBERSHIP_DELTA,
      changed: ['todo', 'done']
    },
    index
  })

  assert.equal(result.action, 'sync')
  assert.notEqual(result.state, previous)
  assert.deepEqual(result.delta.changed, ['todo', 'done'])
  assert.equal(
    result.state.bySection.get('todo')?.get(FIELD_POINTS)?.count?.count,
    0
  )
  assert.equal(
    result.state.bySection.get('done')?.get(FIELD_POINTS)?.count?.count,
    0
  )
})
