import assert from 'node:assert/strict'
import { test } from 'vitest'
import type {
  DateField,
  MultiSelectField,
  NumberField,
  SelectField,
  TextField
} from '@dataview/core/contracts'
import {
  filter
} from '@dataview/core/filter'

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

test('number and date filter specs share sorted demand and lookup semantics', () => {
  assert.deepEqual(
    filter.rule.planDemand(numberField, {
      fieldId: numberField.id,
      presetId: 'eq',
      value: 3
    }),
    {
      sorted: true
    }
  )
  assert.deepEqual(
    filter.rule.sortLookup(numberField, {
      fieldId: numberField.id,
      presetId: 'eq',
      value: 3
    }),
    {
      mode: 'eq',
      value: 3
    }
  )
  assert.deepEqual(
    filter.rule.planDemand(dateField, {
      fieldId: dateField.id,
      presetId: 'exists_true'
    }),
    {
      sorted: true
    }
  )
  assert.deepEqual(
    filter.rule.sortLookup(dateField, {
      fieldId: dateField.id,
      presetId: 'exists_true'
    }),
    {
      mode: 'exists'
    }
  )
})

test('option bucket filter specs share bucket lookup semantics', () => {
  const selectValue = filter.value.optionSet.create(['todo'])
  const multiSelectValue = filter.value.optionSet.create(['bug'])

  assert.deepEqual(
    filter.rule.bucketLookup(selectField, {
      fieldId: selectField.id,
      presetId: 'eq',
      value: selectValue
    }),
    {
      mode: 'include',
      keys: ['todo']
    }
  )
  assert.deepEqual(
    filter.rule.bucketLookup(selectField, {
      fieldId: selectField.id,
      presetId: 'neq',
      value: selectValue
    }),
    {
      mode: 'exclude',
      keys: ['todo']
    }
  )
  assert.deepEqual(
    filter.rule.bucketLookup(multiSelectField, {
      fieldId: multiSelectField.id,
      presetId: 'contains',
      value: multiSelectValue
    }),
    {
      mode: 'include',
      keys: ['bug']
    }
  )
})

test('fixed presets still clear editable value and keep none preview fallback', () => {
  const nextRule = filter.rule.applyPreset(textField, {
    id: 'filter_rule_1',
    fieldId: textField.id,
    presetId: 'contains',
    value: 'hello'
  }, 'exists_true')

  assert.deepEqual(nextRule, {
    id: 'filter_rule_1',
    fieldId: textField.id,
    presetId: 'exists_true'
  })
  assert.equal(filter.rule.editorKind(textField, nextRule), 'none')
  assert.deepEqual(filter.rule.project(textField, nextRule), {
    kind: 'none'
  })
})
