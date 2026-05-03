import { describe, expect, it, vi } from 'vitest'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  EdgePatch
} from '@whiteboard/core/types'
import { createEdgeConnectSession } from '../src/input/features/edge/connect'
import { DEFAULT_DRAW_STATE } from '../src/schema/draw-state'
import { createEditorStateRuntime } from '../src/state/runtime'

const createInteractionDeps = () => {
  const reconnectCommit = vi.fn(() => ({ ok: true }))
  const state = createEditorStateRuntime({
    initialTool: {
      type: 'select'
    },
    initialDrawState: DEFAULT_DRAW_STATE
  })

  return {
    reconnectCommit,
    readPatch: (): EdgePatch | undefined => state.read().preview.edge['edge-1']?.patch,
    ctx: {
      state,
      scene: {
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
        },
        ui: {
          state: {
            viewport: {
              get: () => ({
                zoom: 1
              })
            }
          }
        },
      },
      runtime: {
        viewport: {
          pointer: () => ({
            world: { x: 0, y: 0 }
          })
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
        }
      },
      actions: {
        document: {
          edge: {
            reconnectCommit,
            create: vi.fn(),
            type: {},
            route: {}
          }
        },
        session: {
          tool: {
            select: vi.fn()
          },
          selection: {
            replace: vi.fn()
          }
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

describe('createEdgeConnectSession', () => {
  it('does not latch straight mode on shift keydown without dragging', () => {
    const { session, readPatch } = createReconnectSession()

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

    const patch = readPatch()

    expect(patch?.type).toBeUndefined()
    expect(patch?.route).toBeUndefined()
  })

  it('keeps straight auto-route latched after shift is released', () => {
    const {
      session,
      reconnectCommit,
      readPatch
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

    const constrainedPatch = readPatch()
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

    const releasedPatch = readPatch()

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
