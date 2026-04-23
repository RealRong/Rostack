import { describe, expect, it } from 'vitest'
import {
  createPlan,
  mergePlans
} from '../src'

describe('scope plans', () => {
  it('merges phases and scoped payloads deterministically', () => {
    type PhaseName = 'graph' | 'scene'
    type ScopeMap = {
      graph: {
        ids: readonly string[]
      }
      scene: {
        ids: readonly string[]
      }
    }

    const left = createPlan<PhaseName, ScopeMap>({
      phases: ['graph'],
      scope: {
        scene: {
          ids: ['node:1']
        }
      }
    })
    const right = createPlan<PhaseName, ScopeMap>({
      scope: {
        scene: {
          ids: ['node:2']
        }
      }
    })

    const merged = mergePlans(left, right)

    expect(merged.phases.has('graph')).toBe(true)
    expect(merged.phases.has('scene')).toBe(true)
    expect(merged.scope?.scene).toEqual({
      ids: ['node:2']
    })
  })
})
