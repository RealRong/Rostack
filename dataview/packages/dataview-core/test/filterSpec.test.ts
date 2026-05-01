import assert from 'node:assert/strict'
import { test } from 'vitest'
import type {
  DateField,
  MultiSelectField,
  NumberField,
  SelectField,
  TextField
} from '@dataview/core/types'
import {
  filter
} from '@dataview/core/view'

const textField: TextField = {
  id: 'title_2',
  name: 'Title 2',
  kind: 'text'
}

const numberField: NumberField = {
  id: 'score',
  name: 'Score',
  kind: 'number',
  format: 'number',
  precision: null,
  currency: null,
  useThousandsSeparator: true
}

const dateField: DateField = {
  id: 'due',
  name: 'Due',
  kind: 'date',
  displayDateFormat: 'full',
  displayTimeFormat: '24h',
  defaultValueKind: 'date',
  defaultTimezone: null
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
      id: 'done',
      name: 'Done',
      color: 'green'
    }
  ]
}

const multiSelectField: MultiSelectField = {
  id: 'tags',
  name: 'Tags',
  kind: 'multiSelect',
  options: [
    {
      id: 'feature',
      name: 'Feature',
      color: 'blue'
    },
    {
      id: 'bug',
      name: 'Bug',
      color: 'red'
    }
  ]
}

test('number and date filters share sorted query semantics', () => {
  assert.deepEqual(
    filter.rule.analyze(numberField, {
      fieldId: numberField.id,
      presetId: 'eq',
      value: 3
    }).query,
    {
      kind: 'sort',
      mode: 'eq',
      value: 3
    }
  )
  assert.deepEqual(
    filter.rule.analyze(dateField, {
      fieldId: dateField.id,
      presetId: 'exists_true'
    }).query,
    {
      kind: 'sort',
      mode: 'exists'
    }
  )
})

test('option filters share bucket query semantics', () => {
  const selectValue = filter.value.optionSet.create(['todo'])
  const multiSelectValue = filter.value.optionSet.create(['bug'])

  assert.deepEqual(
    filter.rule.analyze(selectField, {
      fieldId: selectField.id,
      presetId: 'eq',
      value: selectValue
    }).query,
    {
      kind: 'bucket',
      mode: 'include',
      keys: ['todo']
    }
  )
  assert.deepEqual(
    filter.rule.analyze(selectField, {
      fieldId: selectField.id,
      presetId: 'neq',
      value: selectValue
    }).query,
    {
      kind: 'bucket',
      mode: 'exclude',
      keys: ['todo']
    }
  )
  assert.deepEqual(
    filter.rule.analyze(multiSelectField, {
      fieldId: multiSelectField.id,
      presetId: 'contains',
      value: multiSelectValue
    }).query,
    {
      kind: 'bucket',
      mode: 'include',
      keys: ['bug']
    }
  )
})

test('fixed presets still clear editable value and keep none preview fallback', () => {
  const nextRule = filter.rule.patch(textField, {
    id: 'filter_rule_1',
    fieldId: textField.id,
    presetId: 'contains',
    value: 'hello'
  }, {
    presetId: 'exists_true'
  })

  assert.deepEqual(nextRule, {
    id: 'filter_rule_1',
    fieldId: textField.id,
    presetId: 'exists_true'
  })
  const analysis = filter.rule.analyze(textField, nextRule)
  assert.equal(analysis.editorKind, 'none')
  assert.deepEqual(analysis.project, {
    kind: 'none'
  })
})
