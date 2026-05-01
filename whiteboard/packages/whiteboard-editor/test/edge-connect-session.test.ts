import { describe, expect, it, vi } from 'vitest'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  EdgePatch
} from '@whiteboard/core/types'
import { createEdgeConnectSession } from '../src/input/features/edge/connect'

const createInteractionDeps = () => {
  const reconnectCommit = vi.fn(() => ({ ok: true }))

  return {
    reconnectCommit,
    ctx: {
      projection: {
        edges: {
          get: () => ({
            route: {
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
            }
          }),
          capability: vi.fn(() => ({
            reconnectSource: true,
            reconnectTarget: true
          }))
        },
        nodes: {
          get: vi.fn(() => undefined)
        }
      },
      read: {
        viewport: {
          get: () => ({
            zoom: 1
          }),
          pointer: () => ({
            world: { x: 0, y: 0 }
          })
        }
      },
      runtime: {
        dispatch: vi.fn()
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
      write: {
        edge: {
          reconnectCommit,
          create: vi.fn(),
          type: {},
          route: {}
        }
      },
      actions: {
        tool: {
          set: vi.fn()
        },
        selection: {
          replace: vi.fn(),
          clear: vi.fn(),
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn(),
          selectAll: vi.fn(),
          frame: vi.fn(),
          order: vi.fn(),
          group: vi.fn(),
          ungroup: vi.fn(),
          delete: vi.fn(),
          duplicate: vi.fn()
        }
      }
    } as any
  }
}

const createReconnectSession = () => {
  const runtime = createInteractionDeps()
  const session = createEdgeConnectSession(
    runtime.ctx,
    edgeApi.connect.startReconnect({
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
    const {
      session,
      reconnectCommit
    } = createReconnectSession()

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

    expect(reconnectCommit).toHaveBeenCalledWith({
      edgeId: 'edge-1',
      end: 'target',
      target: {
        kind: 'point',
        point: { x: 20, y: 10 }
      },
      patch: {
        type: 'straight',
        route: {
          kind: 'auto'
        }
      }
    })
  })
})
