const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolvePropertyValueEditorPosition
} = require('../.tmp/group-test-dist/react/page/PropertyValueEditorHost.js')

test('property value editor keeps at least the source width', () => {
  assert.deepStrictEqual(resolvePropertyValueEditorPosition({
    anchor: {
      x: 24,
      y: 80,
      width: 236
    },
    viewportWidth: 1280,
    viewportHeight: 800,
    desiredWidth: 180,
    panelHeight: 240
  }), {
    width: 236,
    left: 24,
    top: 80,
    maxHeight: 692
  })
})

test('property value editor shifts upward when opening near the viewport bottom', () => {
  assert.deepStrictEqual(resolvePropertyValueEditorPosition({
    anchor: {
      x: 24,
      y: 780,
      width: 236
    },
    viewportWidth: 1280,
    viewportHeight: 800,
    desiredWidth: 300,
    panelHeight: 320
  }), {
    width: 300,
    left: 24,
    top: 452,
    maxHeight: 320
  })
})
