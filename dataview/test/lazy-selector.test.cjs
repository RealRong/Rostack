const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createDerivedStore,
  createValueStore
} = require('../.tmp/group-test-dist/runtime/store/index.js')
const {
  createLazySelectorSnapshot
} = require('../.tmp/group-test-dist/react/runtime/store/useLazySelectorValue.js')

const createTrackedStore = initial => {
  const base = createValueStore({ initial })
  let subscribers = 0

  return {
    store: {
      get: base.get,
      set: base.set,
      update: base.update,
      subscribe: listener => {
        subscribers += 1
        const unsubscribe = base.subscribe(listener)
        return () => {
          subscribers -= 1
          unsubscribe()
        }
      }
    },
    subscribers: () => subscribers
  }
}

test('lazy selector snapshot subscribes only to accessed fields', () => {
  const left = createTrackedStore('left')
  const right = createTrackedStore('right')

  const selected = createDerivedStore({
    get: read => {
      const snapshot = createLazySelectorSnapshot(read, {
        left: nextRead => nextRead(left.store),
        right: nextRead => nextRead(right.store)
      })

      return snapshot.left
    }
  })

  const unsubscribe = selected.subscribe(() => {})

  assert.equal(left.subscribers(), 1)
  assert.equal(right.subscribers(), 0)

  unsubscribe()
})

test('lazy selector snapshot de-duplicates repeated reads of the same field', () => {
  const value = createTrackedStore(1)

  const selected = createDerivedStore({
    get: read => {
      const snapshot = createLazySelectorSnapshot(read, {
        value: nextRead => nextRead(value.store)
      })

      return snapshot.value + snapshot.value
    }
  })

  const unsubscribe = selected.subscribe(() => {})

  assert.equal(value.subscribers(), 1)
  assert.equal(selected.get(), 2)

  value.store.set(3)
  assert.equal(selected.get(), 6)

  unsubscribe()
})
