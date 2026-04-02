const test = require('node:test')
const assert = require('node:assert/strict')

const { parsePropertyDraft } = require('../.tmp/group-test-dist/core/property/index.js')

const numberField = { kind: 'number' }

test('number draft clears on empty input', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(numberField, '   '),
    { type: 'clear' }
  )
})

test('number draft keeps contiguous digits across mixed text', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(numberField, '1中文若干555'),
    { type: 'set', value: 1555 }
  )
})

test('number draft preserves the first decimal point across mixed text', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(numberField, '1中文.333'),
    { type: 'set', value: 1.333 }
  )
})

test('number draft accepts leading sign and full-width characters', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(numberField, '￥－１，２３４．５０元'),
    { type: 'set', value: -1234.5 }
  )
})

test('number draft clears input with no digits', () => {
  assert.deepStrictEqual(
    parsePropertyDraft(numberField, '中文abc'),
    { type: 'clear' }
  )
})
