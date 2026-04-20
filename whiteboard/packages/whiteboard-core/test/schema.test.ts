import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createRegistries } from '@whiteboard/core/kernel'
import { schema } from '@whiteboard/core/schema'

test('compileNodeFieldRecord 将 schema field 编译为 canonical node record', () => {
  assert.deepEqual(
    schema.node.compileFieldRecord(
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
    schema.node.compileFieldRecord(
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
    schema.node.compileFieldRecord(
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
    schema.node.compileFieldUpdate(
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
    schema.node.compileFieldUpdates([
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

test('applyNodeDefaults 不再为 auto text 节点写入 bootstrap size', () => {
  const registries = createRegistries()

  assert.equal(
    schema.node.applyDefaults({
      type: 'text',
      position: {
        x: 0,
        y: 0
      },
      data: {
        text: 'hello'
      }
    }, registries).size,
    undefined
  )
})

test('applyNodeDefaults 不再为 wrap text 节点写入 bootstrap size', () => {
  const registries = createRegistries()

  assert.equal(
    schema.node.applyDefaults({
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
    undefined
  )
})
