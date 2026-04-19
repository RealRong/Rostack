import assert from 'node:assert/strict'
import { test } from 'vitest'
import { reduceOperations } from '@whiteboard/core/kernel'
import {
  applyNodeUpdate,
  buildNodeUpdateInverse,
  createNodeFieldsUpdateOperation,
  createNodeUpdateOperation
} from '@whiteboard/core/node'
import { createDocument } from '@whiteboard/core/document'
import { createMindmap } from '@whiteboard/core/mindmap'

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
  const result = reduceOperations(doc, [createNodeUpdateOperation('node_1', {
    records: [{
      scope: 'data',
      op: 'set',
      path: 'text',
      value: 'world'
    }]
  })], {
    now: () => FIXED_TIMESTAMP
  })

  assert.ok(result.ok)
  assert.deepEqual(result.data.inverse, [{
    type: 'node.patch',
    id: 'node_1',
    patch: {
      position: { x: 0, y: 0 },
      size: { width: 120, height: 40 },
      rotation: 0,
      layer: undefined,
      zIndex: undefined,
      groupId: undefined,
      owner: undefined,
      locked: undefined,
      data: {
        text: 'hello',
        items: ['a', 'b', 'c']
      },
      style: {
        color: '#111111',
        fontSize: 12
      }
    }
  }])

  const reverted = replayInverse(result.data.doc, result.data.inverse)
  assert.ok(reverted.ok)
  assert.deepEqual(reverted.data.doc.nodes.node_1, {
    ...doc.nodes.node_1,
    layer: undefined,
    zIndex: undefined,
    groupId: undefined,
    owner: undefined,
    locked: undefined
  })
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

test('node.update 会为 direct mindmap data mutation 标记 node.value', () => {
  const tree = createMindmap({}, {
    idGenerator: {
      nodeId: () => 'mind_1'
    }
  })
  const doc = createDocument('doc_mindmap_1')
  doc.nodes.mind_1 = {
    id: 'mind_1',
    type: 'text',
    owner: {
      kind: 'mindmap',
      id: 'mind_1'
    },
    position: { x: 0, y: 0 },
    data: {
      text: 'root'
    }
  }
  doc.mindmaps.mind_1 = {
    id: 'mind_1',
    root: tree.rootNodeId,
    members: tree.nodes,
    children: tree.children,
    layout: tree.layout,
    meta: tree.meta
  }

  const result = reduceOperations(doc, [createNodeUpdateOperation('mind_1', {
    records: [{
      scope: 'data',
      op: 'set',
      path: 'meta.title',
      value: 'new'
    }]
  })], {
    now: () => FIXED_TIMESTAMP
  })

  assert.ok(result.ok)
  assert.equal(result.data.impact.node.value, true)
  assert.deepEqual(result.data.impact.node.ids, ['mind_1'])
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
      type: 'node.patch',
      id: 'node_1',
      patch: {}
    }
  )

  assert.deepEqual(
    createNodeFieldsUpdateOperation('node_1', {
      position: { x: 10, y: 20 }
    }),
    {
      type: 'node.patch',
      id: 'node_1',
      patch: {
        position: { x: 10, y: 20 }
      }
    }
  )
})
