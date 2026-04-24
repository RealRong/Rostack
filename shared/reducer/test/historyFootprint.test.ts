import { describe, expect, test } from 'vitest'
import * as historyFootprint from '../src/historyFootprint'

describe('historyFootprint', () => {
  test('collector de-duplicates entries by serialized key', () => {
    const collector = historyFootprint.createHistoryFootprintCollector<{
      id: string
      value: number
    }>(entry => entry.id)

    collector.add({
      id: 'a',
      value: 1
    })
    collector.addMany([
      {
        id: 'b',
        value: 2
      },
      {
        id: 'a',
        value: 3
      }
    ])

    expect(collector.has({
      id: 'a',
      value: 999
    })).toBe(true)
    expect(collector.finish()).toEqual([
      {
        id: 'a',
        value: 3
      },
      {
        id: 'b',
        value: 2
      }
    ])
  })

  test('assertHistoryFootprint validates collection shape and item guard', () => {
    expect(historyFootprint.assertHistoryFootprint(
      [{ id: 'a' }],
      (value): value is {
        id: string
      } => (
        typeof value === 'object'
        && value !== null
        && typeof (value as {
          id?: unknown
        }).id === 'string'
      )
    )).toEqual([{ id: 'a' }])

    expect(() => historyFootprint.assertHistoryFootprint(
      'invalid',
      (_value): _value is {
        id: string
      } => true
    )).toThrow('History footprint must be an array.')

    expect(() => historyFootprint.assertHistoryFootprint(
      [{ id: 1 }],
      (value): value is {
        id: string
      } => (
        typeof value === 'object'
        && value !== null
        && typeof (value as {
          id?: unknown
        }).id === 'string'
      )
    )).toThrow('History footprint entry is invalid.')
  })

  test('historyFootprintConflicts short-circuits on the first matching pair', () => {
    expect(historyFootprint.historyFootprintConflicts(
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'c' }, { id: 'b' }],
      (left, right) => left.id === right.id
    )).toBe(true)

    expect(historyFootprint.historyFootprintConflicts(
      [{ id: 'a' }],
      [{ id: 'c' }],
      (left, right) => left.id === right.id
    )).toBe(false)
  })
})
