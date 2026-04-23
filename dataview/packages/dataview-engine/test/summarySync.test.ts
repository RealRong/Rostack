import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  calculation
} from '@dataview/core/calculation'
import {
  createBaseImpact
} from '@dataview/engine/active/shared/baseImpact'
import {
  createPartition
} from '@dataview/engine/active/shared/partition'
import {
  createSelectionFromIds
} from '@dataview/engine/active/shared/selection'
import {
  createRows
} from '@dataview/engine/active/shared/rows'
import {
  runSummaryStage
} from '@dataview/engine/active/summary/runtime'
import {
  deriveSummaryState
} from '@dataview/engine/active/summary/derive'
import type {
  View
} from '@dataview/core/contracts'
import { entityTable } from '@shared/core'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  MembershipPhaseDelta as MembershipDelta,
  MembershipPhaseState as MembershipState
} from '@dataview/engine/active/state'

const FIELD_POINTS = 'points'
const FIELD_STATUS = 'status'
const ROOT_SECTION = 'root'
const VIEW_ID = 'view_table'

const createMembershipState = (
  rows: IndexState['rows'],
  recordIds: readonly string[]
): MembershipState => ({
  sections: createPartition({
    order: [ROOT_SECTION],
    byKey: new Map([
      [ROOT_SECTION, createSelectionFromIds({
        rows,
        ids: recordIds
      })]
    ]),
    keysById: new Map(recordIds.map(recordId => [recordId, [ROOT_SECTION]] as const))
  }),
  meta: new Map([
    [ROOT_SECTION, {
      label: ROOT_SECTION as never
    }]
  ])
})

const createGroupedMembershipState = (
  rows: IndexState['rows'],
  sections: Readonly<Record<string, readonly string[]>>
): MembershipState => {
  const order = Object.keys(sections)
  const keysByRecord = new Map<string, string[]>()

  order.forEach(sectionId => {
    sections[sectionId]?.forEach(recordId => {
      const keys = keysByRecord.get(recordId) ?? []
      if (!keysByRecord.has(recordId)) {
        keysByRecord.set(recordId, keys)
      }
      keys.push(sectionId)
    })
  })

  return {
    sections: createPartition({
      order,
      byKey: new Map(order.map(sectionId => [
        sectionId,
        createSelectionFromIds({
          rows,
          ids: sections[sectionId] ?? []
        })
      ] as const)),
      keysById: keysByRecord
    }),
    meta: new Map(order.map(sectionId => [
      sectionId,
      {
        label: sectionId as never
      }
    ] as const))
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
    rules: entityTable.normalize.list([])
  },
  sort: {
    rules: entityTable.normalize.list([])
  },
  calc: {
    [FIELD_POINTS]: 'count'
  },
  display: {
    fields: ['title', FIELD_STATUS, FIELD_POINTS]
  },
  options: {
    widths: {},
    showVerticalLines: true,
    wrap: false
  },
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

const createIndexState = (): IndexState => {
  const recordIds = ['rec_1', 'rec_2']
  const records = {
    ids: recordIds,
    fieldIds: [FIELD_POINTS],
    order: new Map(recordIds.map((recordId, index) => [recordId, index] as const)),
    byId: {} as Record<string, never>,
    values: new Map(),
    rev: 0
  }
  const calculations = {
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
        entriesByIndex: [
          calculation.entry.create({
            field: undefined,
            value: 1,
            capabilities: {
              count: true
            }
          }),
          calculation.entry.create({
            field: undefined,
            value: 2,
            capabilities: {
              count: true
            }
          })
        ],
        global: calculation.state.empty({
          count: true
        })
      }]
    ]),
    rev: 0
  }

  return {
    records,
    search: {
      fields: new Map()
    },
    bucket: {
      fields: new Map(),
      rev: 0
    },
    sort: {
      fields: new Map(),
      rev: 0
    },
    calculations,
    rows: createRows({
      records,
      search: {
        fields: new Map()
      },
      bucket: {
        fields: new Map(),
        rev: 0
      },
      calculations
    })
  } as unknown as IndexState
}

test('summary sync rebuilds section aggregates when section record ids change without section transitions', () => {
  const index = createIndexState()
  const previousMembership = createMembershipState(index.rows, ['rec_1', 'rec_2'])
  const previous = deriveSummaryState({
    membership: previousMembership,
    calcFields: [FIELD_POINTS],
    index,
    action: 'rebuild'
  }).state

  const nextMembership = createMembershipState(index.rows, [])

  const next = deriveSummaryState({
    previous,
    previousMembership,
    membership: nextMembership,
    membershipDelta: {
      ...EMPTY_MEMBERSHIP_DELTA,
      changed: [ROOT_SECTION],
      records: new Map([
        ['rec_1', {
          before: [ROOT_SECTION],
          after: []
        }],
        ['rec_2', {
          before: [ROOT_SECTION],
          after: []
        }]
      ])
    },
    calcFields: [FIELD_POINTS],
    index,
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
  const previousMembership = createGroupedMembershipState(index.rows, {
    todo: ['rec_1'],
    done: ['rec_2']
  })
  const previous = deriveSummaryState({
    membership: previousMembership,
    calcFields: [FIELD_POINTS],
    index,
    action: 'rebuild'
  }).state

  const nextMembership = createGroupedMembershipState(index.rows, {
    todo: [],
    done: []
  })
  const view = createView({
    group: {
      fieldId: FIELD_STATUS,
      mode: 'option',
      bucketSort: 'manual'
    }
  })
  const result = runSummaryStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createBaseImpact({}),
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

test('summary stage reuses previous state when only section meta changes', () => {
  const index = createIndexState()
  const previousMembership = createGroupedMembershipState(index.rows, {
    todo: ['rec_1'],
    done: ['rec_2']
  })
  const previous = deriveSummaryState({
    membership: previousMembership,
    calcFields: [FIELD_POINTS],
    index,
    action: 'rebuild'
  }).state
  const nextMembership: MembershipState = {
    sections: previousMembership.sections,
    meta: new Map([
      ['todo', {
        label: 'Todo Renamed' as never
      }],
      ['done', {
        label: 'done' as never
      }]
    ])
  }
  const view = createView({
    group: {
      fieldId: FIELD_STATUS,
      mode: 'option',
      bucketSort: 'manual'
    }
  })
  const result = runSummaryStage({
    activeViewId: view.id,
    previousViewId: view.id,
    impact: createBaseImpact({}),
    view,
    calcFields: [FIELD_POINTS],
    previous,
    previousMembership,
    membership: nextMembership,
    membershipAction: 'sync',
    membershipDelta: {
      ...EMPTY_MEMBERSHIP_DELTA,
      changed: ['todo']
    },
    index
  })

  assert.equal(result.action, 'reuse')
  assert.equal(result.state, previous)
  assert.deepEqual(result.delta.changed, [])
  assert.deepEqual(result.delta.removed, [])
})
