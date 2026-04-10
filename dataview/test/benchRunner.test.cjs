const test = require('node:test')
const assert = require('node:assert/strict')

const {
  runBenchmarks
} = require('../bench/runner/index.cjs')

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
  assert.equal(typeof suite.avg.totalMs, 'number')
  assert.equal(typeof suite.avg.indexMs, 'number')
  assert.equal(typeof suite.avg.projectMs, 'number')
  assert.ok(Array.isArray(suite.changedStores))
  assert.equal(typeof suite.plan.records, 'string')
  assert.equal(typeof suite.indexActions.records, 'string')
})
