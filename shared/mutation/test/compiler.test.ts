import { describe, expect, test } from 'vitest'
import { compile } from '@shared/mutation'

type CounterDoc = {
  count: number
}

describe('compile', () => {
  test('previews accumulated operations for later intents', () => {
    const result = compile<CounterDoc, number, number, number>({
      doc: {
        count: 0
      },
      intents: [1, 2],
      run: (ctx, intent) => {
        ctx.emit(ctx.doc().count + intent)
        return ctx.doc().count
      },
      previewApply: (doc, ops) => ({
        count: doc.count + ops.reduce((sum, value) => sum + value, 0)
      })
    })

    expect(result.ops).toEqual([1, 3])
    expect(result.outputs).toEqual([0, 1])
    expect(result.doc).toEqual({
      count: 4
    })
  })

  test('stops on the first error and drops current intent operations', () => {
    const result = compile<CounterDoc, string, number>({
      doc: {
        count: 0
      },
      intents: ['a', 'b', 'c'],
      run: (ctx, intent) => {
        if (intent === 'a') {
          ctx.emit(1)
          return
        }

        if (intent === 'b') {
          ctx.emit(2)
          ctx.issue({
            code: 'invalid',
            message: 'Stop here.'
          })
          return
        }

        ctx.emit(3)
      },
      previewApply: (doc, ops) => ({
        count: doc.count + ops.reduce((sum, value) => sum + value, 0)
      }),
      stopOnError: true
    })

    expect(result.ops).toEqual([1])
    expect(result.issues).toEqual([{
      code: 'invalid',
      message: 'Stop here.',
      level: 'error'
    }])
    expect(result.doc).toEqual({
      count: 1
    })
  })

  test('does not stop on warnings', () => {
    const result = compile<CounterDoc, string, number>({
      doc: {
        count: 0
      },
      intents: ['warn', 'next'],
      run: (ctx, intent) => {
        if (intent === 'warn') {
          ctx.issue({
            code: 'warn',
            message: 'Keep going.',
            level: 'warning'
          })
        }

        ctx.emit(1)
      },
      previewApply: (doc, ops) => ({
        count: doc.count + ops.reduce((sum, value) => sum + value, 0)
      }),
      stopOnError: true
    })

    expect(result.ops).toEqual([1, 1])
    expect(result.issues).toEqual([{
      code: 'warn',
      message: 'Keep going.',
      level: 'warning'
    }])
    expect(result.doc).toEqual({
      count: 2
    })
  })

  test('supports explicit blocking without throw/catch control flow', () => {
    const result = compile<CounterDoc, string, number>({
      doc: {
        count: 0
      },
      intents: ['ok', 'block', 'skip'],
      run: (ctx, intent) => {
        if (intent === 'ok') {
          ctx.emit(1)
          return
        }

        if (intent === 'block') {
          ctx.emit(2)
          return ctx.block({
            code: 'invalid',
            message: 'Blocked.',
            details: {
              reason: 'test'
            }
          })
        }

        ctx.emit(3)
      },
      previewApply: (doc, ops) => ({
        count: doc.count + ops.reduce((sum, value) => sum + value, 0)
      })
    })

    expect(result.ops).toEqual([1])
    expect(result.issues).toEqual([{
      code: 'invalid',
      message: 'Blocked.',
      details: {
        reason: 'test'
      },
      level: 'error'
    }])
    expect(result.doc).toEqual({
      count: 1
    })
  })
})
