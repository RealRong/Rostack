import { describe, expect, test } from 'vitest'
import { mutationTrace } from '@shared/core'

describe('mutationTrace', () => {
  test('normalizes touched counts across set map number and all', () => {
    expect(mutationTrace.toTouchedCount(new Set(['a', 'b']))).toBe(2)
    expect(mutationTrace.toTouchedCount(new Map([['a', 1]]))).toBe(1)
    expect(mutationTrace.toTouchedCount('all')).toBe('all')
    expect(mutationTrace.toTouchedCount(3)).toBe(3)
    expect(mutationTrace.toTouchedCount(0)).toBeUndefined()
    expect(mutationTrace.hasTouchedCount('all')).toBe(true)
    expect(mutationTrace.hasTouchedCount(2)).toBe(true)
    expect(mutationTrace.hasTouchedCount(undefined)).toBe(false)
  })

  test('aggregates facts and omits undefined entities', () => {
    const trace = mutationTrace.createMutationTrace({
      summary: {
        reset: false,
        records: false
      },
      entities: {
        touchedRecordCount: undefined as number | 'all' | undefined,
        touchedFieldCount: undefined as number | 'all' | undefined
      }
    })

    trace.assignSummary({
      records: true
    })
    trace.setSummary('reset', true)
    trace.addFact('record.insert', new Set(['a', 'b']))
    trace.addFact('record.insert')
    trace.addFact('record.value', 'all')
    trace.addFact('field.schema', 0)
    trace.setEntity('touchedRecordCount', 'all')

    expect(trace.finish()).toEqual({
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
