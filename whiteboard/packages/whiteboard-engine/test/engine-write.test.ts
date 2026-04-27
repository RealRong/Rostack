import assert from 'node:assert/strict'
import { test } from 'vitest'
import { path as mutationPath } from '@shared/mutation'
import { document as documentApi } from '@whiteboard/core/document'
import { serializeHistoryKey } from '@whiteboard/core/spec/history'
import type { IntentResult } from '@whiteboard/engine'
import { createEngine } from '@whiteboard/engine'
import { product } from '@whiteboard/product'

const readSerializedFootprint = (
  result: IntentResult
) => new Set(
  (result.ok ? result.commit.footprint : []).map(serializeHistoryKey)
)

test('engine exposes node create footprint through intent results', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_create')
  })

  const result = engine.execute({
    type: 'node.create',
    input: {
      type: 'text',
      position: { x: 20, y: 40 },
      data: {
        text: 'hello'
      }
    }
  })

  assert.equal(result.ok, true)
  if (!result.ok) {
    return
  }

  const footprint = readSerializedFootprint(result)
  assert.deepEqual(
    footprint,
    new Set([
      serializeHistoryKey({
        kind: 'node.exists',
        nodeId: result.data.nodeId
      })
    ])
  )
  assert.equal(result.commit.extra.changes.nodes.added.has(result.data.nodeId), true)
})

test('engine maps mindmap topic updates to node + mindmap history keys', () => {
  const engine = createEngine({
    document: documentApi.create('doc_engine_write_mindmap')
  })

  const createResult = engine.execute({
    type: 'mindmap.create',
    input: {
      template: product.mindmap.template.build({
        preset: 'mindmap.capsule-outline'
      })
    }
  })

  assert.equal(createResult.ok, true)
  if (!createResult.ok) {
    return
  }

  const updateResult = engine.execute({
    type: 'node.update',
    updates: [{
      id: createResult.data.rootId,
      input: {
        records: [{
          scope: 'data',
          op: 'set',
          path: mutationPath.of('text'),
          value: 'Updated topic'
        }]
      }
    }]
  })

  assert.equal(updateResult.ok, true)
  const footprint = readSerializedFootprint(updateResult)
  assert.deepEqual(
    footprint,
    new Set([
      serializeHistoryKey({
        kind: 'node.record',
        nodeId: createResult.data.rootId,
        scope: 'data',
        path: mutationPath.of('text')
      }),
      serializeHistoryKey({
        kind: 'mindmap.exists',
        mindmapId: createResult.data.mindmapId
      })
    ])
  )
})
