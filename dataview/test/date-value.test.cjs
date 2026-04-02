const test = require('node:test')
const assert = require('node:assert/strict')

const {
  formatDateValue,
  readDateComparableTimestamp
} = require('../.tmp/group-test-dist/core/property/index.js')
const {
  matchPropertyFilter,
  parsePropertyDraft
} = require('../.tmp/group-test-dist/core/property/index.js')
const {
  createDateValueDraft,
  parseDateValueDraft
} = require('../.tmp/group-test-dist/react/properties/value/editor/pickers/date/DateValueDraft.js')

const dateField = {
  kind: 'date',
  config: {
    type: 'date',
    displayDateFormat: 'short',
    displayTimeFormat: '12h',
    defaultValueKind: 'date',
    defaultTimezone: null
  }
}

test('date field draft parses date-only input into GroupDateValue', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(dateField, '2026-03-24'),
    {
      type: 'set',
      value: {
        kind: 'date',
        start: '2026-03-24'
      }
    }
  )
})

test('date field draft parses datetime input into GroupDateValue', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(dateField, '2026-03-24 09:15'),
    {
      type: 'set',
      value: {
        kind: 'datetime',
        start: '2026-03-24T09:15',
        timezone: null
      }
    }
  )
})

test('date filters compare only against the start boundary', () => {
  assert.equal(
    matchPropertyFilter(
      dateField,
      {
        kind: 'date',
        start: '2026-03-24',
        end: '2026-03-26'
      },
      'eq',
      '2026-03-24'
    ),
    true
  )
})

test('empty date editor draft stays clear until the user changes it', () => {
  const draft = createDateValueDraft(dateField, undefined)

  assert.deepStrictEqual(
    parseDateValueDraft(draft),
    { type: 'clear' }
  )
})

test('datetime display formatting uses field-level date and time settings', () => {
  assert.equal(
    formatDateValue(dateField, {
      kind: 'datetime',
      start: '2026-03-24T09:15',
      timezone: null
    }),
    '3/24/2026 9:15 AM'
  )
})

test('zoned datetime display keeps the stored wall-clock value', () => {
  assert.equal(
    formatDateValue(dateField, {
      kind: 'datetime',
      start: '2026-03-24T09:15',
      timezone: 'America/New_York'
    }),
    '3/24/2026 9:15 AM'
  )
})

test('zoned datetime comparison uses the assigned timezone', () => {
  const shanghai = readDateComparableTimestamp({
    kind: 'datetime',
    start: '2026-03-24T09:15',
    timezone: 'Asia/Shanghai'
  })
  const utc = readDateComparableTimestamp({
    kind: 'datetime',
    start: '2026-03-24T09:15',
    timezone: 'UTC'
  })

  assert.equal(typeof shanghai, 'number')
  assert.equal(typeof utc, 'number')
  assert.ok(shanghai < utc)
})
