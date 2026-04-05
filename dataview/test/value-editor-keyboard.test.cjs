const test = require('node:test')
const assert = require('node:assert/strict')

const {
  keyAction
} = require('../.tmp/group-test-dist/react/properties/value/editor/shared/keyboard.js')

test('keyAction maps Enter and Tab keys to commit triggers', () => {
  assert.deepEqual(keyAction({
    key: 'Enter',
    shiftKey: false,
    composing: false
  }), {
    type: 'commit',
    trigger: 'enter'
  })

  assert.deepEqual(keyAction({
    key: 'Tab',
    shiftKey: false,
    composing: false
  }), {
    type: 'commit',
    trigger: 'tab-next'
  })

  assert.deepEqual(keyAction({
    key: 'Tab',
    shiftKey: true,
    composing: false
  }), {
    type: 'commit',
    trigger: 'tab-previous'
  })
})

test('keyAction preserves cancel and composing behavior', () => {
  assert.deepEqual(keyAction({
    key: 'Escape',
    shiftKey: false,
    composing: false
  }), {
    type: 'cancel'
  })

  assert.deepEqual(keyAction({
    key: 'Enter',
    shiftKey: false,
    composing: true
  }), {
    type: 'none'
  })
})
