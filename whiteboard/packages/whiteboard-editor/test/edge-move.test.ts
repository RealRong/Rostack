import { describe, expect, it, vi } from 'vitest'
import { applyEdgePatch } from '@whiteboard/core/edge'
import type { Edge } from '@whiteboard/core/types'
import type { InteractionContext } from '../src/input/context'
import { createEdgeBodyMoveSession } from '../src/input/edge/move/session'
import { stepEdgeMove, type EdgeMoveState } from '../src/input/edge/move/start'
import type { PointerMoveInput } from '../src/types/input'

const createMovableEdge = (): Edge => ({
  id: 'edge-1',
  type: 'straight',
  source: {
    kind: 'point',
    point: { x: 10, y: 20 }
  },
  target: {
    kind: 'point',
    point: { x: 110, y: 120 }
  }
})

const createMoveState = (
  edge: Edge
): EdgeMoveState => ({
  edgeId: edge.id,
  pointerId: 1,
  edge,
  start: { x: 0, y: 0 },
  delta: { x: 0, y: 0 }
})

const createMoveInput = (
  world: PointerMoveInput['world']
): PointerMoveInput => ({
  world
}) as PointerMoveInput

describe('stepEdgeMove', () => {
  it('keeps the current patch while the pointer is stationary away from origin', () => {
    const edge = createMovableEdge()
    const first = stepEdgeMove(createMoveState(edge), { x: 15, y: 25 })
    const second = stepEdgeMove(first.state, { x: 15, y: 25 })

    expect(first.patch).toBeDefined()
    expect(second.patch).toBeDefined()
    expect(applyEdgePatch(edge, second.patch)).toMatchObject({
      source: {
        kind: 'point',
        point: { x: 25, y: 45 }
      },
      target: {
        kind: 'point',
        point: { x: 125, y: 145 }
      }
    })
  })
})

describe('createEdgeBodyMoveSession', () => {
  it('clears the preview when the edge returns to its origin', () => {
    const edge = createMovableEdge()
    const move = vi.fn()
    const session = createEdgeBodyMoveSession(
      {
        command: {
          edge: { move }
        }
      } as unknown as InteractionContext,
      createMoveState(edge)
    )

    session.move?.(createMoveInput({ x: 15, y: 25 }))
    expect(session.gesture?.kind).toBe('edge-move')

    session.move?.(createMoveInput({ x: 0, y: 0 }))
    expect(session.gesture).toBeNull()
    expect(move).not.toHaveBeenCalled()
  })
})
