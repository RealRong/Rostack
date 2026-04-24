import { describe, expect, test } from 'vitest'
import * as operationBuffer from '../src/operationBuffer'

describe('operationBuffer', () => {
  test('emits operations in append order', () => {
    const buffer = operationBuffer.createOperationBuffer<string>()
    buffer.emit('a')
    buffer.emitMany(['b', 'c'])

    expect(buffer.finish()).toEqual(['a', 'b', 'c'])
    expect(buffer.isEmpty()).toBe(false)
  })

  test('builds inverse operations with prepend and append', () => {
    const inverse = operationBuffer.createInverseBuilder<string>()
    inverse.prepend('b')
    inverse.prepend('a')
    inverse.append('c')
    inverse.prependMany(['head-1', 'head-2'])

    expect(inverse.finish()).toEqual(['head-1', 'head-2', 'a', 'b', 'c'])
  })
})
