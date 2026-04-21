import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { store } from '@shared/core'
import { createCreateRecordApi } from '@dataview/runtime/createRecord'

afterEach(() => {
  vi.useRealTimers()
})

test('createRecord runtime retries opening until the created record becomes available', () => {
  vi.useFakeTimers()

  const activeView = store.createValueStore({
    initial: {
      id: 'view_table',
      type: 'table',
      name: 'Table',
      filter: {
        mode: 'and',
        rules: []
      },
      search: {
        query: ''
      },
      sort: [],
      calc: {},
      display: {
        fields: []
      },
      options: {},
      orders: []
    } as any
  })
  const runtime = createCreateRecordApi({
    activeView
  })
  const openAttempts: number[] = []

  const createdId = runtime.create({
    ownerViewId: 'view_table' as any,
    create: () => 'rec_new' as any,
    open: (_recordId, attempt) => {
      openAttempts.push(attempt)
      return attempt >= 2
        ? 'opened'
        : 'retry'
    },
    retryFrames: 4
  })

  vi.runAllTimers()

  assert.equal(createdId, 'rec_new')
  assert.deepEqual(openAttempts, [0, 1, 2])
})

test('createRecord runtime cancels pending retries when the owner view changes', () => {
  vi.useFakeTimers()

  const activeView = store.createValueStore({
    initial: {
      id: 'view_table',
      type: 'table',
      name: 'Table',
      filter: {
        mode: 'and',
        rules: []
      },
      search: {
        query: ''
      },
      sort: [],
      calc: {},
      display: {
        fields: []
      },
      options: {},
      orders: []
    } as any
  })
  const runtime = createCreateRecordApi({
    activeView
  })
  const openAttempts: number[] = []
  let failed = 0

  const createdId = runtime.create({
    ownerViewId: 'view_table' as any,
    create: () => 'rec_new' as any,
    open: (_recordId, attempt) => {
      openAttempts.push(attempt)
      if (attempt === 0) {
        activeView.set({
          ...activeView.get(),
          id: 'other_view'
        } as any)
      }

      return 'retry'
    },
    retryFrames: 4,
    onFailure: () => {
      failed += 1
    }
  })

  vi.runAllTimers()

  assert.equal(createdId, 'rec_new')
  assert.deepEqual(openAttempts, [0])
  assert.equal(failed, 1)
})

