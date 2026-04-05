const test = require('node:test')
const assert = require('node:assert/strict')

const {
  buildTableBlocks
} = require('../.tmp/group-test-dist/react/views/table/virtual/buildBlocks.js')
const {
  resolveTableWindowOverscan,
  resolveTableWindowSnapshot
} = require('../.tmp/group-test-dist/react/views/table/virtual/runtime.js')

const createLayout = (rowCount = 180) => {
  const rowIds = Array.from({
    length: rowCount
  }, (_, index) => `row-${index + 1}`)
  const blocks = buildTableBlocks({
    grouped: false,
    rowIds,
    sections: [],
    rowHeight: 36,
    headerHeight: 32
  })
  const last = blocks[blocks.length - 1]

  return {
    blocks,
    totalHeight: last
      ? last.top + last.height
      : 0
  }
}

const createViewport = (overrides = {}) => ({
  ready: true,
  viewportTopInCanvas: 0,
  viewportBottomInCanvas: 720,
  viewportHeight: 720,
  viewportWidth: 1280,
  pageScrollTop: 0,
  verticalDirection: 0,
  scrollLeft: 0,
  containerWidth: 0,
  containerHeight: 0,
  contentLeft: 0,
  contentRight: 0,
  ...overrides
})

test('table window bootstrap stays finite instead of falling back to full render', () => {
  const layout = createLayout(180)
  const window = resolveTableWindowSnapshot({
    layout,
    viewport: createViewport({
      ready: false
    }),
    interaction: {
      overscanBefore: 240,
      overscanAfter: 240
    }
  })

  assert.equal(window.startIndex, 0)
  assert.ok(window.endIndex > 0)
  assert.ok(window.items.length > 0)
  assert.ok(window.items.length < layout.blocks.length)
  assert.equal(window.totalHeight, layout.totalHeight)
})

test('table window advances to deeper rows when the viewport moves downward', () => {
  const layout = createLayout(180)
  const window = resolveTableWindowSnapshot({
    layout,
    viewport: createViewport({
      viewportTopInCanvas: 2400,
      viewportBottomInCanvas: 3120
    }),
    interaction: {
      overscanBefore: 240,
      overscanAfter: 240
    }
  })

  assert.ok(window.startIndex > 0)
  assert.ok(window.endIndex > window.startIndex)
  assert.ok(window.items[0].top >= 0)
  assert.ok(window.items[0].top < layout.totalHeight)
})

test('table marquee overscan becomes directional during downward autopan', () => {
  assert.deepStrictEqual(
    resolveTableWindowOverscan({
      marqueeActive: false,
      verticalDirection: 1
    }),
    {
      overscanBefore: 240,
      overscanAfter: 240
    }
  )

  assert.deepStrictEqual(
    resolveTableWindowOverscan({
      marqueeActive: true,
      verticalDirection: 1
    }),
    {
      overscanBefore: 240,
      overscanAfter: 960
    }
  )

  assert.deepStrictEqual(
    resolveTableWindowOverscan({
      marqueeActive: true,
      verticalDirection: -1
    }),
    {
      overscanBefore: 960,
      overscanAfter: 240
    }
  )
})
