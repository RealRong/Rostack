import { describe, expect, test } from 'vitest'
import {
  cowDraft,
  draftList,
  draftPath,
  path
} from '@shared/mutation'

describe('draft', () => {
  test('cowDraft preserves untouched references', () => {
    const base = {
      left: {
        value: 1
      },
      right: {
        value: 2
      }
    }
    const draft = cowDraft.create<typeof base>()(base)

    draftPath.set(
      draft.write(),
      path.of('left', 'value'),
      3
    )

    const next = draft.done()

    expect(next).not.toBe(base)
    expect(next.left).not.toBe(base.left)
    expect(next.right).toBe(base.right)
    expect(next).toEqual({
      left: {
        value: 3
      },
      right: {
        value: 2
      }
    })
  })

  test('draftPath supports nested set and unset', () => {
    const draft = cowDraft.create<{
      data: Record<string, unknown>
    }>()({
      data: {
        meta: {
          title: 'A',
          keep: true
        }
      }
    })

    const root = draft.write()
    draftPath.set(root, path.of('data', 'meta', 'title'), 'B')
    draftPath.unset(root, path.of('data', 'meta', 'keep'))

    expect(draftPath.get(root, path.of('data', 'meta', 'title'))).toBe('B')
    expect(draft.done()).toEqual({
      data: {
        meta: {
          title: 'B'
        }
      }
    })
  })

  test('draftList mutates arrays in place', () => {
    const list = ['a', 'b', 'c']

    draftList.insertAt(list, 1, 'x')
    draftList.move(list, 3, 0)
    draftList.remove(list, 2)

    expect(list).toEqual(['c', 'a', 'b'])
  })
})
