import { describe, expect, it } from 'vitest'
import {
  createPlan,
  defineScope,
  mergePlans,
  set
} from '../src'

describe('scope plans', () => {
  it('merges phases and scoped payloads deterministically', () => {
    type PhaseName = 'graph' | 'scene'
    const sceneScope = defineScope({
      ids: set<string>()
    })
    type ScopeMap = {
      graph: undefined
      scene: typeof sceneScope
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
    expect(merged.phases.has('scene')).toBe(false)
    expect(merged.scope?.scene).toEqual({
      ids: ['node:2']
    })
  })
})
