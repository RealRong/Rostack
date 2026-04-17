import { describe, expect, it } from 'vitest'
import { resolveSelectionPressPlan } from '../src/input/selection/press/plan'
import type { SelectionPressSubject } from '../src/input/selection/press/resolve'

const createTextSubject = (
  overrides: Partial<Extract<SelectionPressSubject<'text'>, { kind: 'node' }>> = {}
): Extract<SelectionPressSubject<'text'>, { kind: 'node' }> => ({
  kind: 'node',
  target: {
    kind: 'node',
    nodeId: 'text-1',
    field: 'text'
  },
  node: {
    id: 'text-1',
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 24 },
    data: {
      text: 'Hello'
    }
  },
  currentSelection: {
    nodeIds: [],
    edgeIds: []
  },
  mode: 'replace',
  selected: false,
  repeat: false,
  canEnter: true,
  groupSelected: false,
  promoteToGroup: false,
  currentSelectionMovable: true,
  groupSelectionMovable: false,
  ...overrides
})

describe('resolveSelectionPressPlan', () => {
  it('selects on first field click before entering edit mode', () => {
    const plan = resolveSelectionPressPlan(createTextSubject(), 'replace')

    expect(plan?.tap).toEqual({
      kind: 'select',
      target: {
        nodeIds: ['text-1'],
        edgeIds: []
      }
    })
  })

  it('enters field edit only when the node is already selected', () => {
    const plan = resolveSelectionPressPlan(createTextSubject({
      selected: true,
      currentSelection: {
        nodeIds: ['text-1'],
        edgeIds: []
      }
    }), 'replace')

    expect(plan?.tap).toEqual({
      kind: 'edit-field',
      nodeId: 'text-1',
      field: 'text',
      selection: {
        nodeIds: ['text-1'],
        edgeIds: []
      }
    })
  })
})
