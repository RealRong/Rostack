import assert from 'node:assert/strict'
import { test } from 'vitest'
import { runBenchmarks } from '@dataview/engine/bench/runner/index'

test('bench runner produces structured output for smoke scenarios', () => {
  const result = runBenchmarks({
    sizes: ['small'],
    scenarios: ['record.value.points.single'],
    iterations: 1,
    warmup: 0,
    silent: true
  })

  assert.equal(result.results.length, 1)

  const suite = result.results[0]
  assert.equal(suite.size, 'small')
  assert.equal(suite.records, 1000)
  assert.equal(suite.scenario.id, 'record.value.points.single')
  assert.equal(typeof suite.avg.elapsedMs, 'number')
})
