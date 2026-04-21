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
  deriveSummaryState
} from '@dataview/engine/active/snapshot/summary/sync'
import type {
  IndexState
} from '@dataview/engine/active/index/contracts'
import type {
  SectionState
} from '@dataview/engine/contracts/state'

const FIELD_POINTS = 'points'
const ROOT_SECTION = 'root'

const createSectionState = (
  recordIds: readonly string[]
): SectionState => ({
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
  const previousSections = createSectionState(['rec_1', 'rec_2'])
  const previous = deriveSummaryState({
    sections: previousSections,
    calcFields: [FIELD_POINTS],
    index,
    impact: createActiveImpact({}),
    action: 'rebuild'
  }).state

  const nextSections = createSectionState([])
  const impact = createActiveImpact({})
  ensureQueryImpact(impact).visibleRemoved.push('rec_1', 'rec_2')

  const next = deriveSummaryState({
    previous,
    previousSections,
    sections: nextSections,
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
