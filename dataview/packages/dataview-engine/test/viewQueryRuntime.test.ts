import assert from 'node:assert/strict'
import { test } from 'vitest'
import { filter } from '@dataview/core/filter'
import { compileViewPlan } from '@dataview/engine/active/plan'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { runQueryStage } from '@dataview/engine/active/query/stage'
import { createBaseImpact } from '@dataview/engine/active/projector/impact'
import { createDocumentReadContext } from '@dataview/engine/document/reader'
import { entityTable } from '@shared/core'

const VIEW_ID = 'view_table'
const FIELD_STATUS = 'status'
const FIELD_POINTS = 'points'
const createEmptyFilter = () => ({
  mode: 'and' as const,
  rules: entityTable.normalize.list([])
})
const createEmptySort = () => ({
  rules: entityTable.normalize.list([])
})
const createFilterState = (input) => input
  ? {
      mode: input.mode ?? 'and',
      rules: Array.isArray(input.rules)
        ? entityTable.normalize.list(input.rules.map((rule, index) => ({
            id: rule.id ?? `filter_${index + 1}`,
            fieldId: rule.fieldId,
            presetId: rule.presetId,
            ...(Object.prototype.hasOwnProperty.call(rule, 'value')
              ? { value: rule.value }
              : {})
          })))
        : input.rules
    }
  : createEmptyFilter()
const createSortState = (rules) => ({
  rules: Array.isArray(rules)
    ? entityTable.normalize.list(rules.map((rule, index) => ({
        id: rule.id ?? `sort_${index + 1}`,
        fieldId: rule.fieldId,
        direction: rule.direction === 'desc' ? 'desc' : 'asc'
      })))
    : (rules ?? createEmptySort().rules)
})

const createDocument = (
  view,
  records = {
    rec_1: {
      status: 'todo',
      points: 1,
      title: 'Task 1'
    }
  }
) => ({
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
          },
          {
            id: 'doing',
            name: 'Doing',
            color: 'blue',
            category: 'in_progress'
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
    byId: Object.fromEntries(
      Object.entries(records).map(([recordId, record]) => [
        recordId,
        {
          id: recordId,
          title: record.title,
          type: 'task',
          values: {
            [FIELD_STATUS]: record.status,
            [FIELD_POINTS]: record.points
          }
        }
      ])
    ),
    order: Object.keys(records)
  },
  meta: {}
})

const createView = (input = {}) => {
  const {
    filter: filterInput,
    sort: sortInput,
    ...rest
  } = input

  return {
    id: VIEW_ID,
    type: 'table',
    name: 'Tasks',
    filter: createFilterState(filterInput),
    search: {
      query: ''
    },
    sort: createSortState(sortInput?.rules ?? sortInput),
    calc: {},
    display: {
      fields: ['title', FIELD_STATUS, FIELD_POINTS]
    },
    options: {
      widths: {},
      showVerticalLines: true,
      wrap: false
    },
    orders: [],
    ...rest
  }
}

test('engine.active.query stage reuses previous state when persisted filter change is ineffective', () => {
  const previousView = createView()
  const nextView = createView({
    filter: {
      mode: 'and',
      rules: entityTable.normalize.list([{
        id: 'filter_status',
        fieldId: FIELD_STATUS,
        presetId: 'eq',
        value: filter.value.optionSet.create()
      }])
    }
  })
  const document = createDocument(nextView)
  const context = createDocumentReadContext(document)
  const index = createIndexState(document)
  const previousPlan = compileViewPlan(context.reader, previousView).query
  const nextPlan = compileViewPlan(context.reader, nextView).query
  const previousState = runQueryStage({
    reader: context.reader,
    activeViewId: previousView.id,
    previousViewId: previousView.id,
    impact: createBaseImpact({}),
    view: previousView,
    plan: previousPlan,
    index
  }).state

  const result = runQueryStage({
    reader: context.reader,
    activeViewId: nextView.id,
    previousViewId: nextView.id,
    impact: createBaseImpact({
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
    previous: previousState
  })

  assert.equal(previousPlan.executionKey, nextPlan.executionKey)
  assert.equal(result.action, 'reuse')
  assert.equal(result.state, previousState)
  assert.equal(result.publishMs, 0)
})

test('engine.active.query reuses matched and ordered ids on filter-only sync', () => {
  const previousView = createView({
    sort: [{
      fieldId: FIELD_POINTS,
      direction: 'desc'
    }]
  })
  const nextView = createView({
    sort: [{
      fieldId: FIELD_POINTS,
      direction: 'desc'
    }],
    filter: {
      mode: 'and',
      rules: [{
        fieldId: FIELD_STATUS,
        presetId: 'eq',
        value: filter.value.optionSet.create(['todo'])
      }]
    }
  })
  const document = createDocument(nextView, {
    rec_1: {
      status: 'todo',
      points: 1,
      title: 'Task 1'
    },
    rec_2: {
      status: 'doing',
      points: 3,
      title: 'Task 2'
    },
    rec_3: {
      status: 'todo',
      points: 2,
      title: 'Task 3'
    }
  })
  const context = createDocumentReadContext(document)
  const index = createIndexState(document)
  const previousPlan = compileViewPlan(context.reader, previousView).query
  const nextPlan = compileViewPlan(context.reader, nextView).query
  const previousStage = runQueryStage({
    reader: context.reader,
    activeViewId: previousView.id,
    previousViewId: previousView.id,
    impact: createBaseImpact({}),
    view: previousView,
    plan: previousPlan,
    index
  })

  const result = runQueryStage({
    reader: context.reader,
    activeViewId: nextView.id,
    previousViewId: nextView.id,
    impact: createBaseImpact({
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
    previous: previousStage.state
  })

  assert.equal(result.action, 'sync')
  assert.equal(result.state.matched, previousStage.state.matched)
  assert.equal(result.state.ordered, previousStage.state.ordered)
  assert.equal(result.state.matched.read.ids(), previousStage.state.matched.read.ids())
  assert.equal(result.state.ordered.read.ids(), previousStage.state.ordered.read.ids())
  assert.deepEqual([...result.state.visible.read.ids()].sort(), ['rec_1', 'rec_3'])
  assert.deepEqual(result.delta.added, [])
  assert.deepEqual(result.delta.removed, ['rec_2'])
  assert.equal(result.delta.orderChanged, false)
})
