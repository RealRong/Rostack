import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reduceOperations } from '../dist/kernel/index.js'
import {
  applyNodeUpdate,
  buildNodeUpdateInverse,
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation
} from '../dist/node/index.js'
import { createDocument } from '../dist/types/index.js'

const FIXED_TIMESTAMP = Date.parse('2024-01-01T00:00:00.000Z')
const FIXED_ISO = new Date(FIXED_TIMESTAMP).toISOString()

const createDocWithNode = (node) => {
  const doc = createDocument('doc_1')
  doc.background = undefined
  doc.meta = {
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO
  }
  doc.nodes[node.id] = node
  doc.order = [{
    kind: 'node',
    id: node.id
  }]
  return doc
}

const createTextNode = (overrides = {}) => ({
  id: 'node_1',
  type: 'text',
  position: { x: 0, y: 0 },
  size: { width: 120, height: 40 },
  rotation: 0,
  data: {
    text: 'hello',
    items: ['a', 'b', 'c']
  },
  style: {
    color: '#111111',
    fontSize: 12
  },
  ...overrides
})

const replayInverse = (doc, operations) =>
  reduceOperations(doc, operations, {
    now: () => FIXED_TIMESTAMP
  })

test('node.update reducer 为 set(path) 生成精确 inverse 并可回放', () => {
  const doc = createDocWithNode(createTextNode())
  const result = reduceOperations(doc, [{
    type: 'node.update',
    id: 'node_1',
    update: {
      records: [{
        scope: 'data',
        op: 'set',
        path: 'text',
        value: 'world'
      }]
    }
  }], {
    now: () => FIXED_TIMESTAMP
  })

  assert.ok(result.ok)
  assert.deepEqual(result.data.inverse, [{
    type: 'node.update',
    id: 'node_1',
    update: {
      records: [{
        scope: 'data',
        op: 'set',
        path: 'text',
        value: 'hello'
      }]
    }
  }])

  const reverted = replayInverse(result.data.doc, result.data.inverse)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.data.doc, doc)
})

test('node.update inverse 在 set(path) 创建缺失祖先时退化为 scope 根级 set', () => {
  const node = createTextNode({
    data: {
      text: 'hello'
    }
  })
  const update = {
    records: [{
      scope: 'data',
      op: 'set',
      path: 'prefs.title',
      value: 'Board'
    }]
  }

  const inverse = buildNodeUpdateInverse(node, update)
  assert.ok(inverse.ok)
  assert.deepEqual(inverse.update, {
    records: [{
      scope: 'data',
      op: 'set',
      value: {
        text: 'hello'
      }
    }]
  })

  const forward = applyNodeUpdate(node, update)
  assert.ok(forward.ok)
  const reverted = applyNodeUpdate(forward.next, inverse.update)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.next, node)
})

test('node.update inverse 为 unset(path) 生成 path set 回滚', () => {
  const node = createTextNode()
  const update = {
    records: [{
      scope: 'style',
      op: 'unset',
      path: 'fontSize'
    }]
  }

  const inverse = buildNodeUpdateInverse(node, update)
  assert.ok(inverse.ok)
  assert.deepEqual(inverse.update, {
    records: [{
      scope: 'style',
      op: 'set',
      path: 'fontSize',
      value: 12
    }]
  })

  const forward = applyNodeUpdate(node, update)
  assert.ok(forward.ok)
  const reverted = applyNodeUpdate(forward.next, inverse.update)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.next, node)
})

test('node.update inverse 为 splice 生成反向 splice 回滚', () => {
  const node = createTextNode()
  const update = {
    records: [{
      scope: 'data',
      op: 'splice',
      path: 'items',
      index: 1,
      deleteCount: 1,
      values: ['x', 'y']
    }]
  }

  const inverse = buildNodeUpdateInverse(node, update)
  assert.ok(inverse.ok)
  assert.deepEqual(inverse.update, {
    records: [{
      scope: 'data',
      op: 'splice',
      path: 'items',
      index: 1,
      deleteCount: 2,
      values: ['b']
    }]
  })

  const forward = applyNodeUpdate(node, update)
  assert.ok(forward.ok)
  const reverted = applyNodeUpdate(forward.next, inverse.update)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.next, node)
})

test('node.update 会为 mindmap data mutation 标记 mindmap.view', () => {
  const doc = createDocWithNode({
    id: 'mind_1',
    type: 'mindmap',
    position: { x: 0, y: 0 },
    data: {
      mindmap: {
        meta: {
          title: 'old'
        }
      }
    }
  })

  const result = reduceOperations(doc, [{
    type: 'node.update',
    id: 'mind_1',
    update: {
      records: [{
        scope: 'data',
        op: 'set',
        path: 'mindmap.meta.title',
        value: 'new'
      }]
    }
  }], {
    now: () => FIXED_TIMESTAMP
  })

  assert.ok(result.ok)
  assert.equal(result.data.read.mindmap.view, true)
  assert.deepEqual(result.data.read.mindmap.ids, ['mind_1'])
})

test('applyNodeUpdate 允许 frame 几何写入，并拒绝穿透 primitive 容器的 path set', () => {
  const frameResult = applyNodeUpdate({
    id: 'frame_1',
    type: 'frame',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 160 }
  }, {
    fields: {
      position: { x: 10, y: 20 }
    }
  })
  assert.equal(frameResult.ok, true)
  assert.deepEqual(frameResult.next.position, { x: 10, y: 20 })

  const primitivePathResult = applyNodeUpdate(createTextNode(), {
    records: [{
      scope: 'data',
      op: 'set',
      path: 'text.value',
      value: 'x'
    }]
  })
  assert.equal(primitivePathResult.ok, false)
  assert.match(primitivePathResult.message, /non-object container/)
})

test('node.update operation builder 会 compact update 载荷', () => {
  assert.deepEqual(
    createNodeUpdateOperation('node_1', {
      fields: undefined,
      records: []
    }),
    {
      type: 'node.update',
      id: 'node_1',
      update: {}
    }
  )

  assert.deepEqual(
    createNodeFieldsUpdateOperation('node_1', {
      position: { x: 10, y: 20 }
    }),
    {
      type: 'node.update',
      id: 'node_1',
      update: {
        fields: {
          position: { x: 10, y: 20 }
        }
      }
    }
  )
})
