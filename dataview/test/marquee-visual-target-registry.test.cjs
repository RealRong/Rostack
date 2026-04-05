const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createVisualTargetRegistry
} = require('../.tmp/group-test-dist/react/runtime/marquee/visualTargets.js')

const createNode = rect => ({
  getBoundingClientRect: () => rect
})

test('visual target registry returns live targets before frozen targets in order', () => {
  const registry = createVisualTargetRegistry()
  registry.register('row-2', createNode({
    left: 0,
    top: 40,
    right: 120,
    bottom: 76,
    width: 120,
    height: 36
  }))
  registry.freeze('row-1', createNode({
    left: 0,
    top: 0,
    right: 120,
    bottom: 36,
    width: 120,
    height: 36
  }))

  assert.deepStrictEqual(registry.getTargets(['row-1', 'row-2']), [
    {
      id: 'row-1',
      rect: {
        left: 0,
        top: 0,
        right: 120,
        bottom: 36,
        width: 120,
        height: 36
      }
    },
    {
      id: 'row-2',
      rect: {
        left: 0,
        top: 40,
        right: 120,
        bottom: 76,
        width: 120,
        height: 36
      }
    }
  ])
})

test('registering a live node clears any frozen target for the same id', () => {
  const registry = createVisualTargetRegistry()
  registry.freeze('row-1', createNode({
    left: 0,
    top: 0,
    right: 120,
    bottom: 36,
    width: 120,
    height: 36
  }))
  registry.register('row-1', createNode({
    left: 0,
    top: 80,
    right: 120,
    bottom: 116,
    width: 120,
    height: 36
  }))

  assert.deepStrictEqual(registry.getTargets(['row-1']), [
    {
      id: 'row-1',
      rect: {
        left: 0,
        top: 80,
        right: 120,
        bottom: 116,
        width: 120,
        height: 36
      }
    }
  ])
})

test('visual target registry exposes live nodes separately from frozen targets', () => {
  const registry = createVisualTargetRegistry()
  const liveNode = createNode({
    left: 0,
    top: 80,
    right: 120,
    bottom: 116,
    width: 120,
    height: 36
  })

  registry.register('row-1', liveNode)
  registry.freeze('row-2', createNode({
    left: 0,
    top: 120,
    right: 120,
    bottom: 156,
    width: 120,
    height: 36
  }))

  assert.equal(registry.node('row-1'), liveNode)
  assert.equal(registry.node('row-2'), null)
  assert.deepStrictEqual(registry.nodes(['row-1', 'row-2']), [liveNode])
})

test('frozen targets track scroll delta instead of staying pinned to their old viewport rect', () => {
  const scrollNode = {
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 1000,
    scrollHeight: 1000,
    clientWidth: 300,
    clientHeight: 300
  }
  const registry = createVisualTargetRegistry({
    resolveScrollTargets: () => ({
      y: {
        node: scrollNode
      }
    })
  })

  registry.freeze('row-3', createNode({
    left: 0,
    top: 120,
    right: 120,
    bottom: 156,
    width: 120,
    height: 36
  }))

  scrollNode.scrollTop = 80
  assert.deepStrictEqual(registry.getTargets(['row-3']), [{
    id: 'row-3',
    rect: {
      left: 0,
      top: 40,
      right: 120,
      bottom: 76,
      width: 120,
      height: 36
    }
  }])

  scrollNode.scrollTop = 20
  assert.deepStrictEqual(registry.getTargets(['row-3']), [{
    id: 'row-3',
    rect: {
      left: 0,
      top: 100,
      right: 120,
      bottom: 136,
      width: 120,
      height: 36
    }
  }])
})
