const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createPageSessionApi
} = require('../.tmp/group-test-dist/react/page/session/api.js')

test('query bar show only enables bar visibility', () => {
  const pageSession = createPageSessionApi({
    query: {
      visible: false
    }
  })

  pageSession.query.show()

  assert.deepStrictEqual(pageSession.store.get().query, {
    visible: true,
    route: null
  })

  pageSession.dispose()
})

test('query bar close only clears the active route', () => {
  const pageSession = createPageSessionApi()

  pageSession.query.open({
    kind: 'filter',
    propertyId: 'field-1'
  })
  pageSession.query.close()

  assert.deepStrictEqual(pageSession.store.get().query, {
    visible: true,
    route: null
  })

  pageSession.dispose()
})

test('query bar hide collapses the bar and clears the active route', () => {
  const pageSession = createPageSessionApi()

  pageSession.query.open({
    kind: 'addSort'
  })
  pageSession.query.hide()

  assert.deepStrictEqual(pageSession.store.get().query, {
    visible: false,
    route: null
  })

  pageSession.dispose()
})
