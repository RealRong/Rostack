const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveTableCloseAction
} = require('../.tmp/group-test-dist/react/views/table/openCell.js')

test('table close action maps editor triggers to grid close actions', () => {
  assert.deepEqual(resolveTableCloseAction('enter'), {
    kind: 'move-next-item'
  })

  assert.deepEqual(resolveTableCloseAction('tab-next'), {
    kind: 'move-next-field'
  })

  assert.deepEqual(resolveTableCloseAction('tab-previous'), {
    kind: 'move-previous-field'
  })

  assert.deepEqual(resolveTableCloseAction('outside'), {
    kind: 'focus-owner'
  })

  assert.deepEqual(resolveTableCloseAction('programmatic'), {
    kind: 'focus-owner'
  })
})
