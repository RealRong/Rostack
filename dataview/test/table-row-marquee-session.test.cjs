const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createValueStore
} = require('../.tmp/group-test-dist/runtime/store/index.js')
const {
  selection
} = require('../.tmp/group-test-dist/react/view/selection.js')
const {
  startRowMarquee
} = require('../.tmp/group-test-dist/react/table/hooks/useRowMarquee.js')

test('starting row marquee clears replace-mode selection state before the new row marquee session begins', () => {
  const rowSelection = createValueStore({
    initial: selection.set(['row-1', 'row-2'], ['row-2'], {
      anchor: 'row-2',
      focus: 'row-2'
    }),
    isEqual: selection.equal
  })
  let gridCleared = 0
  let rowCleared = 0
  const hoverPoints = []

  const base = startRowMarquee({
    currentView: {
      commands: {
        selection: {
          clear: () => {
            rowCleared += 1
          }
        }
      },
    },
    currentSelection: rowSelection.get(),
    clearGridSelection: () => {
      gridCleared += 1
    },
    clearHover: point => {
      hoverPoints.push(point)
    },
    point: {
      x: 40,
      y: 80
    },
    shiftKey: false,
    metaKey: false,
    ctrlKey: false
  })

  assert.deepStrictEqual(base, {
    ids: ['row-2'],
    anchor: 'row-2',
    focus: 'row-2'
  })
  assert.equal(gridCleared, 1)
  assert.equal(rowCleared, 1)
  assert.deepStrictEqual(hoverPoints, [{
    x: 40,
    y: 80
  }])
})

test('starting row marquee with modifiers keeps the previous row selection as merge base', () => {
  const rowSelection = createValueStore({
    initial: selection.set(['row-1', 'row-2'], ['row-2'], {
      anchor: 'row-2',
      focus: 'row-2'
    }),
    isEqual: selection.equal
  })
  let rowCleared = 0

  startRowMarquee({
    currentView: {
      commands: {
        selection: {
          clear: () => {
            rowCleared += 1
          }
        }
      }
    },
    currentSelection: rowSelection.get(),
    clearGridSelection: () => {},
    clearHover: () => {},
    point: null,
    shiftKey: true,
    metaKey: false,
    ctrlKey: false
  })

  assert.equal(rowCleared, 0)
})
