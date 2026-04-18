import { describe, expect, it, vi } from 'vitest'
import {
  startEdgeReconnect
} from '@whiteboard/core/edge'
import type {
  EdgePatch
} from '@whiteboard/core/types'
import type { InteractionDeps } from '../src/input/core/context'
import { createEdgeConnectSession } from '../src/input/features/edge/connect'

const createInteractionDeps = () => {
  const patch = vi.fn(() => ({ ok: true }))

  return {
    patch,
    ctx: {
      query: {
        node: {} as InteractionDeps['query']['node'],
        edge: {
          resolved: {
            get: () => ({
              ends: {
                source: {
                  end: {
                    kind: 'point',
                    point: { x: 0, y: 0 }
                  },
                  point: { x: 0, y: 0 }
                },
                target: {
                  end: {
                    kind: 'point',
                    point: { x: 10, y: 0 }
                  },
                  point: { x: 10, y: 0 }
                }
              }
            })
          }
        },
        viewport: {
          get: () => ({
            zoom: 1
          }),
          pointer: () => ({
            world: { x: 0, y: 0 }
          })
        }
      },
      snap: {
        edge: {
          connect: ({
            pointerWorld
          }: {
            pointerWorld: {
              x: number
              y: number
            }
          }) => ({
            focusedNodeId: undefined,
            resolution: {
              mode: 'free' as const,
              pointWorld: pointerWorld
            }
          })
        }
      },
      command: {
        edge: {
          patch,
          create: vi.fn()
        }
      },
      local: {
        tool: {
          set: vi.fn()
        },
        selection: {
          replace: vi.fn(),
          clear: vi.fn()
        },
        edit: {
          startNode: vi.fn(),
          startEdgeLabel: vi.fn()
        },
        viewport: {
          panScreenBy: vi.fn()
        }
      }
    } as unknown as InteractionDeps
  }
}

const createReconnectSession = () => {
  const runtime = createInteractionDeps()
  const session = createEdgeConnectSession(
    runtime.ctx,
    startEdgeReconnect({
      pointerId: 1,
      edgeId: 'edge-1',
      end: 'target',
      from: {
        kind: 'point',
        point: { x: 10, y: 0 }
      }
    })
  )

  return {
    ...runtime,
    session
  }
}

const readSessionPatch = (
  session: ReturnType<typeof createReconnectSession>['session']
): EdgePatch | undefined => session.gesture?.kind === 'edge-connect'
  ? session.gesture.draft.edgePatches?.[0]?.patch
  : undefined

describe('createEdgeConnectSession', () => {
  it('does not latch straight mode on shift keydown without dragging', () => {
    const { session } = createReconnectSession()

    session.keydown?.({
      key: 'Shift',
      code: 'ShiftLeft',
      repeat: false,
      modifiers: {
        alt: false,
        shift: true,
        ctrl: false,
        meta: false
      }
    })

    const patch = readSessionPatch(session)

    expect(patch?.type).toBeUndefined()
    expect(patch?.route).toBeUndefined()
  })

  it('keeps straight auto-route latched after shift is released', () => {
    const { session, patch } = createReconnectSession()

    session.move?.({
      pointerId: 1,
      world: { x: 20, y: 10 },
      modifiers: {
        alt: false,
        shift: true,
        ctrl: false,
        meta: false
      }
    } as never)

    const constrainedPatch = readSessionPatch(session)
    const constrainedTarget = constrainedPatch?.target

    expect(constrainedPatch?.type).toBe('straight')
    expect(constrainedPatch?.route).toEqual({
      kind: 'auto'
    })
    expect(constrainedTarget?.kind).toBe('point')
    if (constrainedTarget?.kind === 'point') {
      expect(constrainedTarget.point.x).toBeCloseTo(15.8113883008)
      expect(constrainedTarget.point.y).toBeCloseTo(15.8113883008)
    }

    session.keyup?.({
      key: 'Shift',
      code: 'ShiftLeft',
      repeat: false,
      modifiers: {
        alt: false,
        shift: false,
        ctrl: false,
        meta: false
      }
    })

    const releasedPatch = readSessionPatch(session)

    expect(releasedPatch?.type).toBe('straight')
    expect(releasedPatch?.route).toEqual({
      kind: 'auto'
    })
    expect(releasedPatch?.target).toEqual({
      kind: 'point',
      point: { x: 20, y: 10 }
    })

    session.up?.({} as never)

    expect(patch).toHaveBeenCalledWith(
      ['edge-1'],
      {
        target: {
          kind: 'point',
          point: { x: 20, y: 10 }
        },
        type: 'straight',
        route: {
          kind: 'auto'
        }
      }
    )
  })
})
