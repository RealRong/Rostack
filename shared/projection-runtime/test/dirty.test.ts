import { describe, expect, it } from 'vitest'
import {
  createPlan,
  createReadonlySet,
  mergePlans
} from '../src'

describe('dirty plans', () => {
  it('merges phases and dirty tokens deterministically', () => {
    const left = createPlan<'graph' | 'scene', string>({
      phases: ['graph'],
      dirty: new Map([
        ['scene', createReadonlySet(['node:1'])]
      ])
    })
    const right = createPlan<'graph' | 'scene', string>({
      dirty: new Map([
        ['scene', createReadonlySet(['node:2'])]
      ])
    })

    const merged = mergePlans(left, right)

    expect(merged.phases.has('graph')).toBe(true)
    expect(merged.phases.has('scene')).toBe(true)
    expect(merged.dirty?.get('scene')).toEqual(new Set([
      'node:1',
      'node:2'
    ]))
  })
})
