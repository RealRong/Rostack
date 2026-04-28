import assert from 'node:assert/strict'
import { test } from 'vitest'
import { createRegistries } from '@whiteboard/core/registry'
import { schema } from '@whiteboard/core/registry'

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
