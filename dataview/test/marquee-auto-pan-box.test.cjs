const test = require('node:test')
const assert = require('node:assert/strict')

const {
  pointIn,
  rectFromPoints
} = require('../.tmp/group-test-dist/react/dom/geometry.js')

test('marquee box keeps the start anchor fixed while page scrolling changes current content position', () => {
  let top = 40
  const container = {
    scrollLeft: 0,
    scrollTop: 0,
    getBoundingClientRect: () => ({
      left: 0,
      top
    })
  }

  const startClient = {
    x: 20,
    y: 120
  }
  const anchor = pointIn(container, startClient)

  top = -20

  const current = pointIn(container, {
    x: 20,
    y: 120
  })

  assert.deepStrictEqual(rectFromPoints(anchor, current), {
    left: 20,
    top: 80,
    right: 20,
    bottom: 140,
    width: 0,
    height: 60
  })
})
