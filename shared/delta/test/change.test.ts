import { expectTypeOf, test } from 'vitest'
import type {
  IdDelta
} from '../src'
import {
  change
} from '../src'

type RecordId = `record:${string}`
type ValueRef = {
  recordId: RecordId
  fieldId: string
}
type BucketId = `bucket:${string}`

const typedChange = change<{
  ids: {
    records: RecordId
    values: ValueRef
  }
  set: {
    buckets: BucketId
  }
}>({
  reset: 'flag',
  records: 'ids',
  values: 'ids',
  buckets: 'set'
} as const)

test('change infers typed ids and set leaves from config', () => {
  const state = typedChange.create()
  const recordId = 'record:a' as const
  const valueRef: ValueRef = {
    recordId,
    fieldId: 'title'
  }
  const bucketId = 'bucket:main' as const

  typedChange.flag(state, 'reset')
  typedChange.ids.add(state, 'records', recordId)
  typedChange.ids.update(state, 'values', valueRef)
  typedChange.set(state, 'buckets', bucketId)

  expectTypeOf(state.records).toEqualTypeOf<IdDelta<RecordId>>()
  expectTypeOf(state.values).toEqualTypeOf<IdDelta<ValueRef>>()
  expectTypeOf(state.buckets).toEqualTypeOf<Set<BucketId>>()
})
