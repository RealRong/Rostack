import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  compileNodeFieldRecord,
  compileNodeFieldUpdate,
  compileNodeFieldUpdates
} from '@whiteboard/core/schema'

test('compileNodeFieldRecord 将 schema field 编译为 canonical node record', () => {
  assert.deepEqual(
    compileNodeFieldRecord(
      { scope: 'style', path: 'fontSize' },
      14
    ),
    {
      scope: 'style',
      op: 'set',
      path: 'fontSize',
      value: 14
    }
  )

  assert.deepEqual(
    compileNodeFieldRecord(
      { path: 'title' },
      'Board'
    ),
    {
      scope: 'data',
      op: 'set',
      path: 'title',
      value: 'Board'
    }
  )

  assert.deepEqual(
    compileNodeFieldRecord(
      { scope: 'style', path: 'fontSize' },
      undefined
    ),
    {
      scope: 'style',
      op: 'unset',
      path: 'fontSize'
    }
  )
})

test('compileNodeFieldUpdate 与 compileNodeFieldUpdates 只输出 canonical records', () => {
  assert.deepEqual(
    compileNodeFieldUpdate(
      { scope: 'data', path: 'text' },
      'hello'
    ),
    {
      records: [{
        scope: 'data',
        op: 'set',
        path: 'text',
        value: 'hello'
      }]
    }
  )

  assert.deepEqual(
    compileNodeFieldUpdates([
      {
        field: { scope: 'style', path: 'color' },
        value: '#111111'
      },
      {
        field: { scope: 'style', path: 'fontSize' },
        value: undefined
      }
    ]),
    {
      records: [
        {
          scope: 'style',
          op: 'set',
          path: 'color',
          value: '#111111'
        },
        {
          scope: 'style',
          op: 'unset',
          path: 'fontSize'
        }
      ]
    }
  )
})
