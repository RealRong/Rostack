const test = require('node:test')
const assert = require('node:assert/strict')

const {
  canFallbackToRowHover,
  resolveHoverTargetFromPoint
} = require('../.tmp/group-test-dist/react/views/table/model/hoverResolver.js')

test('row hover fallback is blocked for column headers', () => {
  assert.equal(canFallbackToRowHover({
    withinContainer: true,
    overBlockingOverlay: false,
    overGroupRow: false,
    overColumn: true
  }), false)
})

test('row hover fallback is blocked for blocking overlays', () => {
  assert.equal(canFallbackToRowHover({
    withinContainer: true,
    overBlockingOverlay: true,
    overGroupRow: false,
    overColumn: false
  }), false)
})

test('row hover fallback remains enabled in blank table body space', () => {
  assert.equal(canFallbackToRowHover({
    withinContainer: true,
    overBlockingOverlay: false,
    overGroupRow: false,
    overColumn: false
  }), true)
})

test('hover resolver does not synthesize a row hover when fallback is blocked', () => {
  assert.equal(resolveHoverTargetFromPoint({
    point: {
      x: 24,
      y: 12
    },
    elementAtPoint: () => 'column',
    targetFromElement: () => null,
    allowsRowFallback: () => false,
    rowTargetFromPoint: () => ({
      type: 'row-rail',
      rowId: 'row-1'
    })
  }), null)
})

test('hover resolver synthesizes a row hover when fallback is allowed', () => {
  assert.deepStrictEqual(resolveHoverTargetFromPoint({
    point: {
      x: 24,
      y: 48
    },
    elementAtPoint: () => 'body-blank',
    targetFromElement: () => null,
    allowsRowFallback: () => true,
    rowTargetFromPoint: () => ({
      type: 'row-rail',
      rowId: 'row-2'
    })
  }), {
    type: 'row-rail',
    rowId: 'row-2'
  })
})
