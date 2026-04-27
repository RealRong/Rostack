import assert from 'node:assert/strict'
import { test } from 'vitest'
import type { Invalidation } from '@whiteboard/core/types'
import {
  deriveImpact,
  summarizeInvalidation
} from '@whiteboard/core/spec/operation'

const createInvalidation = (): Invalidation => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: new Set(),
  edges: new Set(),
  groups: new Set(),
  mindmaps: new Set()
})

test('summarizeInvalidation 将 invalidation 收敛为共享 trace 摘要', () => {
  const invalidation = createInvalidation()
  invalidation.background = true
  invalidation.nodes.add('node_1')
  invalidation.nodes.add('node_2')
  invalidation.groups.add('group_1')

  assert.deepEqual(summarizeInvalidation(invalidation), {
    summary: {
      reset: false,
      document: true,
      background: true,
      canvasOrder: false,
      nodes: true,
      edges: false,
      groups: true,
      mindmaps: false
    },
    facts: [{
      kind: 'document.background'
    }, {
      kind: 'node.touch',
      count: 2
    }, {
      kind: 'group.touch'
    }],
    entities: {
      touchedNodeCount: 2,
      touchedGroupCount: 1
    }
  })
})

test('deriveImpact 保持 mindmap invalidation 到 read impact 的投影规则', () => {
  const invalidation = createInvalidation()
  invalidation.mindmaps.add('mindmap_1')

  assert.deepEqual(deriveImpact(invalidation), {
    reset: false,
    document: false,
    node: {
      ids: [],
      geometry: true,
      list: false,
      value: true
    },
    edge: {
      ids: [],
      nodeIds: [],
      geometry: false,
      list: false,
      value: false
    }
  })
})
