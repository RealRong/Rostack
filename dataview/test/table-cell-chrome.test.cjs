const test = require('node:test')
const assert = require('node:assert/strict')

const {
  cellChrome
} = require('../.tmp/group-test-dist/react/table/model/chrome.js')

test('cell chrome suppresses hover tone and fill handle during marquee while preserving selection frame', () => {
  assert.deepStrictEqual(cellChrome({
    selected: true,
    frameActive: true,
    hovered: false,
    fillHandleActive: false
  }), {
    selection: true,
    frame: true,
    hover: false,
    fill: false
  })
})

test('cell chrome suppresses hover tone and fill handle during marquee', () => {
  assert.deepStrictEqual(cellChrome({
    selected: false,
    frameActive: true,
    hovered: false,
    fillHandleActive: false
  }), {
    selection: false,
    frame: true,
    hover: false,
    fill: false
  })
})

test('cell chrome shows hover tone only for hovered unselected cells', () => {
  assert.deepStrictEqual(cellChrome({
    hovered: true,
    selected: false,
    frameActive: false,
    fillHandleActive: false
  }), {
    selection: false,
    frame: false,
    hover: true,
    fill: false
  })

  assert.deepStrictEqual(cellChrome({
    hovered: true,
    selected: true,
    frameActive: false,
    fillHandleActive: false
  }), {
    selection: true,
    frame: false,
    hover: false,
    fill: false
  })
})

test('cell chrome allows selected overlay, active frame, and fill handle together', () => {
  assert.deepStrictEqual(cellChrome({
    hovered: false,
    selected: true,
    frameActive: true,
    fillHandleActive: true
  }), {
    selection: true,
    frame: true,
    hover: false,
    fill: true
  })
})

test('cell chrome hides selection visuals while preserving semantic selection state upstream', () => {
  assert.deepStrictEqual(cellChrome({
    hovered: false,
    selected: true,
    frameActive: true,
    fillHandleActive: true,
    selectionVisible: false
  }), {
    selection: false,
    frame: false,
    hover: false,
    fill: false
  })
})
