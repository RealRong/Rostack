import assert from 'node:assert/strict'
import { test } from 'vitest'
import { entityTable } from '@shared/core'
import type {
  SelectField,
  StatusField
} from '@dataview/core/types'
import {
  field
} from '@dataview/core/field'

const selectField: SelectField = {
  id: 'priority',
  name: 'Priority',
  kind: 'select',
  options: entityTable.normalize.list([
    {
      id: 'high',
      name: 'High',
      color: 'red'
    },
    {
      id: 'in_progress',
      name: 'In Progress',
      color: 'blue'
    }
  ])
}

const statusField: StatusField = {
  id: 'status',
  name: 'Status',
  kind: 'status',
  defaultOptionId: null,
  options: entityTable.normalize.list([
    {
      id: 'todo',
      name: 'To do',
      color: 'gray',
      category: 'todo'
    },
    {
      id: 'doing',
      name: 'Doing',
      color: 'blue',
      category: 'in_progress'
    }
  ])
}

test('field option read helpers share lookup semantics', () => {
  assert.equal(field.option.read.find(selectField, ' HIGH ')?.id, 'high')
  assert.equal(
    field.option.read.findByName(field.option.read.list(selectField), ' in progress ')?.id,
    'in_progress'
  )
  assert.deepEqual(
    field.option.read.tokens(selectField, 'high'),
    ['High', 'high']
  )
  assert.equal(field.option.read.order(selectField, 'in_progress'), 1)
})

test('field option token creation shares the same key normalizer as field schema', () => {
  assert.equal(
    field.schema.key.create('In Progress'),
    field.option.token.create([], 'In Progress')
  )
  assert.equal(
    field.option.token.create(field.option.read.list(selectField), 'In Progress'),
    'in_progress_2'
  )
})

test('field option write.replace preserves status option shape', () => {
  assert.deepEqual(
    field.option.write.replace(statusField, [
      ...field.option.read.list(statusField),
      {
        id: 'done',
        name: 'Done',
        color: null,
        category: 'complete'
      }
    ]),
    {
      options: entityTable.normalize.list([
        {
          id: 'todo',
          name: 'To do',
          color: 'gray',
          category: 'todo'
        },
        {
          id: 'doing',
          name: 'Doing',
          color: 'blue',
          category: 'in_progress'
        },
        {
          id: 'done',
          name: 'Done',
          color: null,
          category: 'complete'
        }
      ])
    }
  )
})
