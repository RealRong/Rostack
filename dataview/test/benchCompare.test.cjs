const test = require('node:test')
const assert = require('node:assert/strict')
const {
  mkdtempSync,
  writeFileSync
} = require('node:fs')
const {
  join
} = require('node:path')
const {
  tmpdir
} = require('node:os')

const {
  compareBenchmarks
} = require('../bench/runner/compare.cjs')

const writeJson = (directory, name, value) => {
  const target = join(directory, name)
  writeFileSync(target, JSON.stringify(value, null, 2))
  return target
}

test('bench compare reports timing regression over threshold', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dataview-bench-compare-'))
  const baselinePath = writeJson(directory, 'baseline.json', {
    results: [{
      size: 'small',
      scenario: {
        id: 'record.value.points.single'
      },
      avg: {
        totalMs: 10,
        indexMs: 5,
        projectMs: 4,
        publishMs: 1
      },
      plan: {
        records: 'reuse'
      },
      indexActions: {
        records: 'sync'
      }
    }]
  })
  const currentPath = writeJson(directory, 'current.json', {
    results: [{
      size: 'small',
      scenario: {
        id: 'record.value.points.single'
      },
      avg: {
        totalMs: 14,
        indexMs: 5,
        projectMs: 4,
        publishMs: 1
      },
      plan: {
        records: 'reuse'
      },
      indexActions: {
        records: 'sync'
      }
    }]
  })

  const result = compareBenchmarks({
    baseline: baselinePath,
    current: currentPath,
    threshold: 0.2,
    minDeltaMs: 1
  })

  assert.equal(result.ok, false)
  assert.equal(result.warnings[0]?.kind, 'timing')
  assert.equal(result.warnings[0]?.metric, 'totalMs')
})

test('bench compare reports plan drift even without timing regression', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dataview-bench-compare-'))
  const baselinePath = writeJson(directory, 'baseline.json', {
    results: [{
      size: 'small',
      scenario: {
        id: 'record.value.status.grouped'
      },
      avg: {
        totalMs: 10,
        indexMs: 5,
        projectMs: 4,
        publishMs: 1
      },
      plan: {
        sections: 'reconcile'
      },
      indexActions: {
        group: 'sync'
      }
    }]
  })
  const currentPath = writeJson(directory, 'current.json', {
    results: [{
      size: 'small',
      scenario: {
        id: 'record.value.status.grouped'
      },
      avg: {
        totalMs: 10.2,
        indexMs: 5,
        projectMs: 4.1,
        publishMs: 1.1
      },
      plan: {
        sections: 'recompute'
      },
      indexActions: {
        group: 'sync'
      }
    }]
  })

  const result = compareBenchmarks({
    baseline: baselinePath,
    current: currentPath,
    threshold: 0.5,
    minDeltaMs: 10
  })

  assert.equal(result.ok, false)
  assert.equal(result.warnings[0]?.kind, 'plan')
})
