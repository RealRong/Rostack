import assert from 'node:assert/strict'
import { test } from 'vitest'
import type {
  SelectField,
  TextField,
  View
} from '@dataview/core/types'
import {
  buildRecordCreateIntents
} from '../src/operations/plan'

const textField: TextField = {
  id: 'notes',
  name: 'Notes',
  kind: 'text'
}

const selectField: SelectField = {
  id: 'status',
  name: 'Status',
  kind: 'select',
  options: [
    {
      id: 'todo',
      name: 'Todo',
      color: 'gray'
    },
    {
      id: 'doing',
      name: 'Doing',
      color: 'blue'
    }
  ]
}

const emptyViewFilter = (
  mode: View['filter']['mode'] = 'and'
): BuildFilter => ({
  mode,
  rules: []
})

type BuildFilter = {
  mode: View['filter']['mode']
  rules: Parameters<typeof buildRecordCreateIntents>[0]['filter']['rules']
}

test('buildRecordCreateIntents applies filter defaults in core', () => {
  const actions = buildRecordCreateIntents({
    recordId: 'record_1',
    hasField: fieldId => fieldId === textField.id,
    filter: {
      ...emptyViewFilter(),
      rules: [{
        fieldId: textField.id,
        field: textField,
        rule: {
          id: 'filter_1',
          fieldId: textField.id,
          presetId: 'eq',
          value: 'hello'
        },
        effective: true
      }]
    }
  })

  assert.ok(actions)
  assert.deepEqual(actions, [{
    type: 'record.create',
    input: {
      id: 'record_1',
      values: {
        notes: 'hello'
      }
    }
  }])
})

test('buildRecordCreateIntents applies group defaults in core', () => {
  const actions = buildRecordCreateIntents({
    recordId: 'record_2',
    hasField: fieldId => fieldId === selectField.id,
    filter: emptyViewFilter(),
    group: {
      view: {
        fieldId: selectField.id,
        mode: 'option',
        bucketSort: 'manual',
        showEmpty: true
      },
      field: selectField,
      bucketId: 'doing'
    }
  })

  assert.ok(actions)
  assert.deepEqual(actions, [{
    type: 'record.create',
    input: {
      id: 'record_2',
      values: {
        status: 'doing'
      }
    }
  }])
})
