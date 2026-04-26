import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createStageMetrics } from '../src'

test('createStageMetrics derives reused and rebuilt counts from changed nodes', () => {
  assert.deepEqual(
    createStageMetrics({
      inputCount: 2,
      outputCount: 5,
      changedNodeCount: 2,
      changedRecordCount: 3
    }),
    {
      inputCount: 2,
      outputCount: 5,
      reusedNodeCount: 3,
      rebuiltNodeCount: 2,
      changedRecordCount: 3
    }
  )
})
