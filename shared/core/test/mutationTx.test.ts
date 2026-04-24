import { describe, expect, test } from 'vitest'
import { mutationTx } from '@shared/core'

describe('mutationTx', () => {
  test('creates a self-referential facade around runtime', () => {
    const tx = mutationTx.createMutationTx<{
      count: number
    }, {
      _runtime: {
        count: number
      }
      read(): number
      write(next: number): void
    }>({
      runtime: {
        count: 1
      },
      create: (self) => ({
        read: () => self._runtime.count,
        write: (next) => {
          self._runtime.count = next
        }
      })
    })

    expect(tx.read()).toBe(1)

    tx.write(3)

    expect(tx.read()).toBe(3)
    expect(tx._runtime.count).toBe(3)
  })
})
