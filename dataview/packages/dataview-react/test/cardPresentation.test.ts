import { describe, expect, test } from 'vitest'
import { resolveCardPresentation } from '@dataview/react/views/shared/cardPresentation'

describe('resolveCardPresentation', () => {
  test('card size no longer changes stacked typography', () => {
    const sm = resolveCardPresentation({
      size: 'sm',
      layout: 'stacked',
      hasVisibleFields: true
    })
    const lg = resolveCardPresentation({
      size: 'lg',
      layout: 'stacked',
      hasVisibleFields: true
    })

    expect(sm.slots.title?.text).toBe(lg.slots.title?.text)
    expect(sm.slots.property?.value).toBe(lg.slots.property?.value)
    expect(sm.slots.property?.list).toBe(lg.slots.property?.list)
  })

  test('card size no longer changes compact typography', () => {
    const sm = resolveCardPresentation({
      size: 'sm',
      layout: 'compact',
      hasVisibleFields: true
    })
    const lg = resolveCardPresentation({
      size: 'lg',
      layout: 'compact',
      hasVisibleFields: true
    })

    expect(sm.slots.title?.text).toBe(lg.slots.title?.text)
    expect(sm.slots.property?.value).toBe(lg.slots.property?.value)
    expect(sm.slots.property?.list).toBe(lg.slots.property?.list)
  })
})
