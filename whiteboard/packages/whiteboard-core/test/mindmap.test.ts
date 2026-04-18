import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  addChild,
  createMindmap,
  createBlankMindmapTemplate,
  instantiateMindmapTemplate,
  insertNode,
  layoutMindmap,
  layoutMindmapTidy,
  moveSubtree,
  patchMindmap,
  removeSubtree
} from '@whiteboard/core/mindmap'

test('mindmap commands mutate the authored tree directly', () => {
  let nodeSeq = 1
  const idGenerator = {
    nodeId: () => `node_${nodeSeq++}`
  }

  const tree = createMindmap({}, { idGenerator })
  assert.equal(tree.rootNodeId, 'node_1')
  assert.deepEqual(tree.children[tree.rootNodeId], [])

  const addRight = addChild(
    tree,
    tree.rootNodeId,
    { kind: 'text', text: 'child-1' },
    { side: 'right', idGenerator }
  )
  assert.ok(addRight.ok)

  const addLeft = addChild(
    addRight.data.tree,
    tree.rootNodeId,
    { kind: 'text', text: 'child-2' },
    { side: 'left', idGenerator }
  )
  assert.ok(addLeft.ok)

  const tree2 = addLeft.data.tree
  const [rightChildId, leftChildId] = tree2.children[tree2.rootNodeId]
  assert.equal(tree2.nodes[rightChildId]?.side, 'right')
  assert.equal(tree2.nodes[leftChildId]?.side, 'left')

  const move = moveSubtree(tree2, {
    nodeId: leftChildId,
    parentId: rightChildId
  })
  assert.ok(move.ok)
  assert.equal(move.data.tree.nodes[leftChildId]?.parentId, rightChildId)
  assert.equal(move.data.tree.nodes[leftChildId]?.side, undefined)

  const removed = removeSubtree(move.data.tree, {
    nodeId: rightChildId
  })
  assert.ok(removed.ok)
  assert.equal(removed.data.tree.nodes[rightChildId], undefined)
  assert.equal(removed.data.tree.nodes[leftChildId], undefined)
})

test('mindmap layout outputs coordinates for authored nodes', () => {
  let nodeSeq = 1
  const idGenerator = {
    nodeId: () => `node_${nodeSeq++}`
  }
  const tree = createMindmap({}, { idGenerator })
  const add = addChild(
    tree,
    tree.rootNodeId,
    { kind: 'text', text: 'child' },
    { side: 'right', idGenerator }
  )
  assert.ok(add.ok)
  const tree1 = add.data.tree

  const getNodeSize = () => ({ width: 120, height: 30 })
  const layout = layoutMindmap(tree1, getNodeSize)
  const tidy = layoutMindmapTidy(tree1, getNodeSize)

  assert.ok(layout.node[tree1.rootNodeId])
  assert.ok(tidy.node[tree1.rootNodeId])
  assert.ok(layout.bbox.width >= 0 && layout.bbox.height >= 0)
  assert.ok(tidy.bbox.width >= 0 && tidy.bbox.height >= 0)
})

test('mindmap patch only updates layout authored data', () => {
  const tree = createMindmap()
  const result = patchMindmap(tree, {
    layout: {
      mode: 'tidy',
      hGap: 180
    }
  })

  assert.ok(result.ok)
  assert.equal(result.data.tree.rootNodeId, tree.rootNodeId)
  assert.equal(result.data.tree.layout.mode, 'tidy')
  assert.equal(result.data.tree.layout.hGap, 180)
  assert.equal(result.data.tree.layout.vGap, tree.layout.vGap)
  assert.deepEqual(result.data.tree.children, tree.children)
})

test('mindmap insertNode inserts a new parent in the authored tree', () => {
  let nodeSeq = 1
  const idGenerator = {
    nodeId: () => `node_${nodeSeq++}`
  }

  const tree = createMindmap({}, { idGenerator })
  const childResult = addChild(
    tree,
    tree.rootNodeId,
    { kind: 'text', text: 'child' },
    { side: 'left', idGenerator }
  )
  assert.ok(childResult.ok)

  const wrapResult = insertNode(
    childResult.data.tree,
    {
      kind: 'parent',
      nodeId: childResult.data.nodeId,
      payload: { kind: 'text', text: 'parent' }
    },
    { idGenerator }
  )
  assert.ok(wrapResult.ok)

  const nextTree = wrapResult.data.tree
  const parentId = wrapResult.data.nodeId
  const childId = childResult.data.nodeId

  assert.equal(nextTree.nodes[parentId]?.parentId, nextTree.rootNodeId)
  assert.equal(nextTree.nodes[parentId]?.side, 'left')
  assert.equal(nextTree.nodes[childId]?.parentId, parentId)
  assert.deepEqual(nextTree.children[parentId], [childId])
  assert.equal(nextTree.children[nextTree.rootNodeId]?.[0], parentId)
})

test('instantiateMindmapTemplate produces root and child node templates for owned nodes', () => {
  let nodeSeq = 1
  const result = instantiateMindmapTemplate({
    template: createBlankMindmapTemplate(),
    rootId: 'node_root',
    createNodeId: () => `node_${++nodeSeq}`
  })

  const rootId = result.tree.rootNodeId
  assert.equal(rootId, 'node_root')
  assert.equal(result.nodes[rootId]?.type, 'text')

  const rootChildren = result.tree.children[rootId] ?? []
  rootChildren.forEach((childId) => {
    assert.equal(result.nodes[childId]?.type, 'text')
  })
})
