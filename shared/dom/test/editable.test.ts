import { describe, expect, it } from 'vitest'
import { normalizeEditableTextValue } from '../src/editable'

describe('normalizeEditableTextValue', () => {
  it('keeps plain text unchanged', () => {
    expect(normalizeEditableTextValue('213')).toBe('213')
    expect(normalizeEditableTextValue('213\n4')).toBe('213\n4')
  })

  it('removes the synthetic trailing newline reported by contenteditable', () => {
    expect(normalizeEditableTextValue('\n')).toBe('')
    expect(normalizeEditableTextValue('213\n\n')).toBe('213\n')
    expect(normalizeEditableTextValue('213\n\n\n')).toBe('213\n\n')
  })

  it('normalizes carriage returns before trimming the trailing sentinel', () => {
    expect(normalizeEditableTextValue('213\r\n\r\n')).toBe('213\n')
  })
})
