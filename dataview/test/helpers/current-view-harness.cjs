const {
  createGroupEngine
} = require('../../.tmp/group-test-dist/index.js')
const {
  createCurrentViewStore
} = require('../../.tmp/group-test-dist/react/view/currentViewStore.js')
const {
  createPageSessionApi
} = require('../../.tmp/group-test-dist/react/page/session/api.js')
const {
  createResolvedPageStateStore
} = require('../../.tmp/group-test-dist/react/page/session/state.js')
const {
  createValueStore
} = require('../../.tmp/group-test-dist/runtime/store/index.js')

const createCurrentViewHarness = (input) => {
  const engine = createGroupEngine({
    document: input.document
  })
  const page = createPageSessionApi(input.initialPage)
  const valueEditorOpen = createValueStore({
    initial: false
  })
  const { currentView, dispose } = createCurrentViewStore({
    engine,
    pageStateStore: createResolvedPageStateStore({
      document: engine.read.document,
      page: page.store,
      valueEditorOpen
    })
  })

  return {
    engine,
    page,
    currentView,
    dispose: () => {
      dispose()
      page.dispose()
    }
  }
}

module.exports = {
  createCurrentViewHarness
}
