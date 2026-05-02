import { describe, expect, it, vi } from 'vitest'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type { Edge } from '@whiteboard/core/types'
import { EMPTY_PREVIEW_STATE } from '../src/state/preview'
import { createEdgeMoveSession, stepEdgeMove, type EdgeMoveState } from '../src/input/features/edge/move'
import type { PointerMoveInput } from '../src/api/input'

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
    expect(edgeApi.patch.apply(edge, second.patch)).toMatchObject({
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

describe('createEdgeMoveSession', () => {
  it('clears the preview when the edge returns to its origin', () => {
    const edge = createMovableEdge()
    const move = vi.fn()
    let preview = EMPTY_PREVIEW_STATE
    const session = createEdgeMoveSession(
      {
        actions: {
          edge: { move }
        },
        dispatch: (input: any) => {
          const command = typeof input === 'function'
            ? input({
                overlay: {
                  preview
                }
              })
            : input
          if (command?.type === 'overlay.preview.set') {
            preview = command.preview
          }
        }
      } as any,
      createMoveState(edge)
    )

    session.move?.(createMoveInput({ x: 15, y: 25 }))
    expect(preview.edges['edge-1']?.patch).toBeDefined()

    session.move?.(createMoveInput({ x: 0, y: 0 }))
    expect(preview.edges['edge-1']).toBeUndefined()
    expect(move).not.toHaveBeenCalled()
  })
})
