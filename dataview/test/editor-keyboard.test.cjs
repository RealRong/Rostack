const test = require('node:test')
const assert = require('node:assert/strict')

const {
  pageShortcutAction
} = require('../.tmp/group-test-dist/react/page/keyboard.js')
const {
  keyDown
} = require('../.tmp/group-test-dist/react/page/interaction/index.js')

const input = (key, overrides = {}) => keyDown({
  key,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...overrides
})

test('page keyboard resolves primary z to undo', () => {
  assert.deepStrictEqual(pageShortcutAction(input('z', {
    metaKey: true
  })), {
    kind: 'undo'
  })

  assert.deepStrictEqual(pageShortcutAction(input('z', {
    ctrlKey: true
  })), {
    kind: 'undo'
  })
})

test('page keyboard resolves shift primary z and ctrl y to redo', () => {
  assert.deepStrictEqual(pageShortcutAction(input('z', {
    metaKey: true,
    shiftKey: true
  })), {
    kind: 'redo'
  })

  assert.deepStrictEqual(pageShortcutAction(input('y', {
    ctrlKey: true
  })), {
    kind: 'redo'
  })
})

test('page keyboard resolves shared shortcuts', () => {
  assert.deepStrictEqual(pageShortcutAction(input('a', {
    metaKey: true
  })), {
    kind: 'select-all'
  })

  assert.deepStrictEqual(pageShortcutAction(input('Delete')), {
    kind: 'remove-selection'
  })

  assert.deepStrictEqual(pageShortcutAction(input('Backspace')), {
    kind: 'remove-selection'
  })

  assert.deepStrictEqual(pageShortcutAction(input('Escape')), {
    kind: 'clear-selection'
  })
})

test('page keyboard ignores unrelated shortcuts', () => {
  assert.equal(pageShortcutAction(input('z', {
    altKey: true,
    ctrlKey: true
  })), null)

  assert.equal(pageShortcutAction(input('x', {
    metaKey: true
  })), null)

  assert.equal(pageShortcutAction(input('a', {
    metaKey: true,
    shiftKey: true
  })), null)
})
