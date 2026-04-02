const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createPageSessionApi
} = require('../.tmp/group-test-dist/react/page/session/api.js')
const {
  normalizeSettingsRoute
} = require('../.tmp/group-test-dist/react/page/session/settings.js')

test('view settings close hides the popover without resetting the current route', () => {
  const pageSession = createPageSessionApi()

  pageSession.settings.open({ kind: 'propertyList' })
  pageSession.settings.close()

  assert.deepStrictEqual(pageSession.store.get().settings, {
    visible: false,
    route: { kind: 'propertyList' }
  })

  pageSession.dispose()
})

test('view settings open without an explicit route re-enters at root', () => {
  const pageSession = createPageSessionApi()

  pageSession.settings.open({
    kind: 'propertyEdit',
    propertyId: 'field-1'
  })
  pageSession.settings.close()
  pageSession.settings.open()

  assert.deepStrictEqual(pageSession.store.get().settings, {
    visible: true,
    route: { kind: 'root' }
  })

  pageSession.dispose()
})

test('view settings back only changes the route and keeps visibility', () => {
  const pageSession = createPageSessionApi()

  pageSession.settings.open({
    kind: 'propertyEdit',
    propertyId: 'field-1'
  })
  pageSession.settings.back()

  assert.deepStrictEqual(pageSession.store.get().settings, {
    visible: true,
    route: { kind: 'propertyList' }
  })

  pageSession.dispose()
})

test('group route falls back to root for view types without group settings', () => {
  assert.deepStrictEqual(
    normalizeSettingsRoute(
      { kind: 'group' },
      [],
      true,
      'gallery'
    ),
    { kind: 'root' }
  )
})
