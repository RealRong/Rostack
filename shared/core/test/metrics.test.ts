import { describe, expect, test } from 'vitest'
import { metrics } from '@shared/core'

describe('metrics', () => {
  test('createRunningStat returns an empty accumulator', () => {
    expect(metrics.createRunningStat()).toEqual({
      count: 0,
      total: 0,
      avg: 0,
      max: 0
    })
  })

  test('updateRunningStat records valid numeric samples only', () => {
    const stat = metrics.createRunningStat()

    metrics.updateRunningStat(stat, 10)
    metrics.updateRunningStat(stat, undefined)
    metrics.updateRunningStat(stat, Number.NaN)
    metrics.updateRunningStat(stat, 20)

    expect(stat).toEqual({
      count: 2,
      total: 30,
      avg: 15,
      max: 20
    })
  })

  test('cloneRunningStat preserves optional percentiles', () => {
    const cloned = metrics.cloneRunningStat({
      count: 3,
      total: 45,
      avg: 15,
      max: 20,
      p95: 19
    })

    expect(cloned).toEqual({
      count: 3,
      total: 45,
      avg: 15,
      max: 20,
      p95: 19
    })
  })
})
