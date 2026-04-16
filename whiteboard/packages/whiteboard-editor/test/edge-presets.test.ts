import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EDGE_PRESET_KEY,
  EDGE_PRESET_KEYS,
  readEdgePresetCreate
} from '../src/tool/edgePresets'

describe('edge preset catalog', () => {
  it('uses arrow as the default edge preset', () => {
    expect(DEFAULT_EDGE_PRESET_KEY).toBe('edge.arrow')
  })

  it('keeps the confirmed preset order', () => {
    expect(EDGE_PRESET_KEYS).toEqual([
      'edge.line',
      'edge.arrow',
      'edge.elbow-arrow',
      'edge.fillet-arrow',
      'edge.curve-arrow'
    ])
  })

  it('maps line and fillet presets to the expected create payloads', () => {
    expect(readEdgePresetCreate('edge.line')).toEqual({
      type: 'straight'
    })

    expect(readEdgePresetCreate('edge.fillet-arrow')).toEqual({
      type: 'fillet',
      style: {
        end: 'arrow'
      }
    })
  })
})
