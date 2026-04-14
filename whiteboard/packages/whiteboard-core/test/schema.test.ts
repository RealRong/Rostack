import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createRegistries } from '@whiteboard/core/kernel'
import {
  applyNodeDefaults,
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

test('applyNodeDefaults 为 auto text 节点补齐系统初始尺寸', () => {
  const registries = createRegistries()

  assert.deepEqual(
    applyNodeDefaults({
      type: 'text',
      position: {
        x: 0,
        y: 0
      },
      data: {
        text: 'hello'
      }
    }, registries).size,
    {
      width: 144,
      height: 24
    }
  )
})

test('applyNodeDefaults 为 wrap text 节点使用 wrapWidth 作为初始宽度', () => {
  const registries = createRegistries()

  assert.deepEqual(
    applyNodeDefaults({
      type: 'text',
      position: {
        x: 0,
        y: 0
      },
      data: {
        text: 'wrapped',
        widthMode: 'wrap',
        wrapWidth: 240
      }
    }, registries).size,
    {
      width: 240,
      height: 24
    }
  )
})
