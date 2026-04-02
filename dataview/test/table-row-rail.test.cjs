const test = require('node:test')
const assert = require('node:assert/strict')

const {
  rowRailState
} = require('../.tmp/group-test-dist/react/table/model/rowRail.js')

test('row rail keeps checkbox ghosted and drag hidden during row drag', () => {
  assert.deepStrictEqual(rowRailState({
    dragActive: true,
    dragDisabled: false,
    marqueeActive: false,
    hovered: true,
    selected: true
  }), {
    selection: 'ghost',
    drag: 'hidden'
  })
})

test('row rail only shows marquee checkbox for selected rows', () => {
  assert.deepStrictEqual(rowRailState({
    dragActive: false,
    dragDisabled: false,
    marqueeActive: true,
    hovered: true,
    selected: false
  }), {
    selection: 'ghost',
    drag: 'hidden'
  })

  assert.deepStrictEqual(rowRailState({
    dragActive: false,
    dragDisabled: false,
    marqueeActive: true,
    hovered: false,
    selected: true
  }), {
    selection: 'visible',
    drag: 'hidden'
  })
})

test('row rail shows drag and selection together on hovered reorderable rows', () => {
  assert.deepStrictEqual(rowRailState({
    dragActive: false,
    dragDisabled: false,
    marqueeActive: false,
    hovered: true,
    selected: false
  }), {
    selection: 'visible',
    drag: 'visible'
  })
})

test('row rail keeps checkbox ghosted on unselected rows without hover', () => {
  assert.deepStrictEqual(rowRailState({
    dragActive: false,
    dragDisabled: true,
    marqueeActive: false,
    hovered: false,
    selected: false
  }), {
    selection: 'ghost',
    drag: 'hidden'
  })
})

test('row rail keeps a ghost checkbox for idle unselected rows', () => {
  assert.deepStrictEqual(rowRailState({
    dragActive: false,
    dragDisabled: true,
    marqueeActive: false,
    hovered: false,
    selected: false
  }), {
    selection: 'ghost',
    drag: 'hidden'
  })
})
