import { describe, expect, test } from 'vitest'
import { path } from '@shared/mutation'

describe('path', () => {
  test('builds and compares typed paths', () => {
    const root = path.root()
    const entry = path.of('blocks', 1, 'title')

    expect(path.eq(root, [])).toBe(true)
    expect(path.eq(entry, ['blocks', 1, 'title'])).toBe(true)
    expect(path.eq(entry, ['blocks', '1', 'title'])).toBe(false)
  })

  test('checks ancestry and overlap', () => {
    const parent = path.of('blocks', 1)
    const child = path.append(parent, 'title')
    const other = path.of('blocks', 2)

    expect(path.startsWith(child, parent)).toBe(true)
    expect(path.startsWith(parent, child)).toBe(false)
    expect(path.overlaps(parent, child)).toBe(true)
    expect(path.overlaps(parent, other)).toBe(false)
  })

  test('returns parent and stable debug string', () => {
    const value = path.of('blocks', 1, 'title')

    expect(path.parent(path.root())).toBeUndefined()
    expect(path.parent(path.of('blocks'))).toEqual(path.root())
    expect(path.parent(value)).toEqual(['blocks', 1])
    expect(path.toString(value)).toBe('[\"blocks\",1,\"title\"]')
  })
})
