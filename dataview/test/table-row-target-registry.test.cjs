const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createNodes
} = require('../.tmp/group-test-dist/react/views/table/dom/registry.js')

const createContainer = () => {
  let top = 20

  return {
    get top() {
      return top
    },
    setTop(nextTop) {
      top = nextTop
    },
    scrollLeft: 0,
    scrollTop: 0,
    getBoundingClientRect: () => ({
      left: 10,
      top,
      right: 410,
      bottom: top + 320,
      width: 400,
      height: 320
    })
  }
}

const createRowNode = rect => ({
  getBoundingClientRect: () => rect
})

test('row marquee cache keeps a row selectable after it unmounts mid-session', () => {
  const container = createContainer()
  const nodes = createNodes({
    resolveContainer: () => container
  })
  const rowNode = createRowNode({
    left: 20,
    top: 80,
    right: 320,
    bottom: 116,
    width: 300,
    height: 36
  })

  nodes.registerRow('row-1', rowNode)
  nodes.startRowMarquee(['row-1'])
  nodes.registerRow('row-1', null)

  assert.deepStrictEqual(nodes.rows(['row-1']), [])
  assert.deepStrictEqual(nodes.hitRows(['row-1'], {
    left: 24,
    top: 84,
    right: 180,
    bottom: 96
  }), ['row-1'])
})

test('rows that mount after marquee start are measured into the active cache', () => {
  const container = createContainer()
  const nodes = createNodes({
    resolveContainer: () => container
  })
  const rowNode = createRowNode({
    left: 20,
    top: 160,
    right: 320,
    bottom: 196,
    width: 300,
    height: 36
  })

  nodes.startRowMarquee(['row-2'])
  nodes.registerRow('row-2', rowNode)

  assert.deepStrictEqual(nodes.hitRows(['row-2'], {
    left: 24,
    top: 164,
    right: 180,
    bottom: 176
  }), ['row-2'])
})

test('row marquee cache stays in container-local coordinates as the page viewport moves', () => {
  const container = createContainer()
  const nodes = createNodes({
    resolveContainer: () => container
  })
  const rowNode = createRowNode({
    left: 20,
    top: 160,
    right: 320,
    bottom: 196,
    width: 300,
    height: 36
  })

  nodes.registerRow('row-3', rowNode)
  nodes.startRowMarquee(['row-3'])
  nodes.registerRow('row-3', null)

  container.setTop(-20)

  assert.deepStrictEqual(nodes.hitRows(['row-3'], {
    left: 24,
    top: 124,
    right: 180,
    bottom: 136
  }), ['row-3'])
})

test('row marquee cache resolves horizontal hit bounds from the current table content bounds', () => {
  const container = createContainer()
  let bounds = {
    left: 20,
    right: 320
  }
  const nodes = createNodes({
    resolveContainer: () => container,
    resolveHorizontalBounds: () => bounds
  })
  const rowNode = createRowNode({
    left: 20,
    top: 120,
    right: 320,
    bottom: 156,
    width: 300,
    height: 36
  })

  nodes.registerRow('row-4', rowNode)
  nodes.startRowMarquee(['row-4'])
  nodes.registerRow('row-4', null)

  bounds = {
    left: 80,
    right: 260
  }

  assert.deepStrictEqual(nodes.hitRows(['row-4'], {
    left: 120,
    top: 124,
    right: 180,
    bottom: 136
  }), ['row-4'])

  assert.deepStrictEqual(nodes.hitRows(['row-4'], {
    left: 20,
    top: 124,
    right: 60,
    bottom: 136
  }), [])
})
