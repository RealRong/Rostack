import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { compareBenchmarks } from '@dataview/engine/bench/runner/compare'

const writeJson = (directory: string, name: string, value: unknown) => {
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
        elapsedMs: 10
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
        elapsedMs: 14
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
  assert.equal(result.warnings[0]?.metric, 'elapsedMs')
})

test('bench compare ignores removed perf plan metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dataview-bench-compare-'))
  const baselinePath = writeJson(directory, 'baseline.json', {
    results: [{
      size: 'small',
      scenario: {
        id: 'record.value.status.grouped'
      },
      avg: {
        elapsedMs: 10
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
        elapsedMs: 10.2
      }
    }]
  })

  const result = compareBenchmarks({
    baseline: baselinePath,
    current: currentPath,
    threshold: 0.5,
    minDeltaMs: 10
  })

  assert.equal(result.ok, true)
  assert.equal(result.warnings.length, 0)
})
