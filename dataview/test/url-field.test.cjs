const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getPropertyDisplayValue
} = require('../.tmp/group-test-dist/core/property/index.js')

test('url field defaults to compact host display', () => {
  assert.equal(
    getPropertyDisplayValue(
      { kind: 'url' },
      'https://www.baidu.com/s?wd=test'
    ),
    'baidu.com'
  )
})

test('url field can display the full raw url', () => {
  assert.equal(
    getPropertyDisplayValue(
      {
        kind: 'url',
        config: {
          type: 'url',
          displayFullUrl: true
        }
      },
      'https://www.baidu.com/s?wd=test'
    ),
    'https://www.baidu.com/s?wd=test'
  )
})

test('url field falls back to the raw value when compact parsing fails', () => {
  assert.equal(
    getPropertyDisplayValue(
      { kind: 'url' },
      'not a valid url'
    ),
    'not a valid url'
  )
})
