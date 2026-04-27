import { describe, expect, test } from 'vitest'
import { trace } from '@shared/trace'

const testTraceSpec = {
  summary: {
    reset: 'flag',
    records: 'flag'
  },
  entities: {
    touchedRecordCount: 'count',
    touchedFieldCount: 'count'
  }
} as const

describe('trace', () => {
  test('normalizes touched counts across set map number and all', () => {
    expect(trace.count(new Set(['a', 'b']))).toBe(2)
    expect(trace.count(new Map([['a', 1]]))).toBe(1)
    expect(trace.count('all')).toBe('all')
    expect(trace.count(3)).toBe(3)
    expect(trace.count(0)).toBeUndefined()
    expect(trace.has('all')).toBe(true)
    expect(trace.has(2)).toBe(true)
    expect(trace.has(undefined)).toBe(false)
  })

  test('aggregates facts and omits undefined entities', () => {
    const summary = trace.create({
      spec: testTraceSpec,
      summary: {
        reset: false,
        records: false
      },
      entities: {
        touchedRecordCount: undefined,
        touchedFieldCount: undefined
      }
    })

    summary.assignSummary({
      records: true
    })
    summary.setSummary('reset', true)
    summary.addFact('record.insert', new Set(['a', 'b']))
    summary.addFact('record.insert')
    summary.addFact('record.value', 'all')
    summary.addFact('field.schema', 0)
    summary.setEntity('touchedRecordCount', 'all')

    expect(summary.finish()).toEqual({
      summary: {
        reset: true,
        records: true
      },
      facts: [{
        kind: 'record.insert',
        count: 3
      }, {
        kind: 'record.value'
      }],
      entities: {
        touchedRecordCount: 'all'
      }
    })
  })
})
