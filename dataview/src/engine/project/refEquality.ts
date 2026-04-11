import {
  sameJsonValue,
  sameMap
} from '@shared/core'
import type {
  Field,
} from '@dataview/core/contracts'
import type {
  Schema
} from './types'

const equalField = (
  left: Field,
  right: Field
) => sameJsonValue(left, right)

export const sameSchema = (
  left: Schema,
  right: Schema
) => sameMap(left.fields, right.fields, equalField)
