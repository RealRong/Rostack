const test = require('node:test')
const assert = require('node:assert/strict')

const {
  applyPropertyFilterPreset,
  createDefaultPropertyFilterRule,
  getPropertyFilterPreset
} = require('../.tmp/group-test-dist/core/property/index.js')

const createStatusProperty = options => ({
  id: 'field-status',
  name: 'Status',
  kind: 'status',
  config: {
    type: 'status',
    options
  }
})

test('createDefaultPropertyFilterRule keeps status filters as structured empty targets', () => {
  const property = createStatusProperty([
    {
      id: 'todo',
      key: 'todo',
      name: 'Todo',
      category: 'todo'
    },
    {
      id: 'done',
      key: 'done',
      name: 'Done',
      category: 'complete'
    }
  ])

  assert.deepStrictEqual(
    createDefaultPropertyFilterRule(property),
    {
      property: 'field-status',
      op: 'eq',
      value: {
        targets: []
      }
    }
  )
})

test('applyPropertyFilterPreset preserves structured status option targets across non-exists presets', () => {
  const property = createStatusProperty([
    {
      id: 'todo',
      key: 'todo',
      name: 'Todo option',
      category: 'todo'
    },
    {
      id: 'ship',
      key: 'ship',
      name: 'Ship',
      category: 'in_progress'
    }
  ])

  const rule = {
    property: 'field-status',
    op: 'eq',
    value: {
      targets: [{
        kind: 'option',
        value: 'todo'
      }]
    }
  }

  assert.deepStrictEqual(
    applyPropertyFilterPreset(rule, property, {
      operator: 'neq'
    }),
    {
      property: 'field-status',
      op: 'neq',
      value: {
        targets: [{
          kind: 'option',
          value: 'todo'
        }]
      }
    }
  )
})

test('applyPropertyFilterPreset resets hidden preset values back to canonical empty values', () => {
  const property = {
    id: 'field-score',
    name: 'Score',
    kind: 'number',
    config: {
      type: 'number',
      format: 'number'
    }
  }

  assert.deepStrictEqual(
    applyPropertyFilterPreset({
      property: 'field-score',
      op: 'exists',
      value: false
    }, property, {
      operator: 'neq'
    }),
    {
      property: 'field-score',
      op: 'neq',
      value: undefined
    }
  )
})

test('getPropertyFilterPreset matches canonical checkbox preset values', () => {
  const property = {
    id: 'field-done',
    name: 'Done',
    kind: 'checkbox',
    config: {
      type: 'checkbox'
    }
  }

  assert.equal(
    getPropertyFilterPreset(property, {
      property: 'field-done',
      op: 'eq',
      value: true
    })?.id,
    'checked'
  )
})
