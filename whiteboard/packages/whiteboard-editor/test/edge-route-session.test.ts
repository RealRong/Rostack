import { describe, expect, it, vi } from 'vitest'
import { createEdgeRoutePressSession } from '../src/input/features/edge/route'

const createEdge = () => ({
  id: 'edge-1',
  type: 'straight' as const,
  source: {
    kind: 'point' as const,
    point: { x: 0, y: 0 }
  },
  target: {
    kind: 'point' as const,
    point: { x: 100, y: 20 }
  },
  route: {
    kind: 'manual' as const,
    points: [{
      id: 'point-1',
      x: 20,
      y: 20
    }]
  }
})

const createDeps = () => {
  const edge = createEdge()
  const setRoute = vi.fn(() => ({ ok: true }))
  const insertRoute = vi.fn(() => ({ ok: true, data: { pointId: 'unused' } }))
  const updateRoute = vi.fn(() => ({ ok: true }))

  return {
    edge,
    setRoute,
    insertRoute,
    updateRoute,
    ctx: {
      projection: {
        edges: {
          get: () => ({
            base: {
              edge
            }
          }),
          edit: vi.fn(() => ({
            route: {
              handles: []
            }
          }))
        },
        nodes: {
          get: vi.fn(() => undefined)
        }
      },
      sessionRead: {
        viewport: {
          pointer: ({
            clientX,
            clientY
          }: {
            clientX: number
            clientY: number
          }) => ({
            world: {
              x: clientX,
              y: clientY
            }
          })
        }
      },
      write: {
        edge: {
          route: {
            set: setRoute,
            insert: insertRoute,
            update: updateRoute
          }
        }
      }
    } as any
  }
}

const createStart = () => ({
  phase: 'down' as const,
  pointerId: 1,
  button: 0,
  buttons: 1,
  detail: 1,
  client: { x: 50, y: 10 },
  screen: { x: 50, y: 10 },
  world: { x: 50, y: 10 },
  samples: [],
  modifiers: {
    alt: false,
    shift: false,
    ctrl: false,
    meta: false
  },
  pick: {
    kind: 'edge' as const,
    id: 'edge-1',
    part: 'path' as const
  },
  editable: false,
  ignoreInput: false,
  ignoreSelection: false,
  ignoreContextMenu: false
})

describe('createEdgeRoutePressSession', () => {
  it('commits insert tap through a single route.set', () => {
    const {
      setRoute,
      insertRoute,
      updateRoute,
      ctx
    } = createDeps()

    const session = createEdgeRoutePressSession(ctx, createStart() as never, {
      kind: 'insert',
      edgeId: 'edge-1',
      index: 1,
      pointerId: 1,
      startWorld: { x: 50, y: 10 },
      origin: { x: 50, y: 10 },
      point: { x: 50, y: 10 }
    })

    session.up?.({
      client: { x: 50, y: 10 }
    } as never)

    expect(setRoute).toHaveBeenCalledTimes(1)
    expect(setRoute).toHaveBeenCalledWith('edge-1', {
      kind: 'manual',
      points: [
        { x: 20, y: 20 },
        { x: 50, y: 10 }
      ]
    })
    expect(insertRoute).not.toHaveBeenCalled()
    expect(updateRoute).not.toHaveBeenCalled()
  })

  it('commits insert drag through a single route.set', () => {
    const {
      setRoute,
      insertRoute,
      updateRoute,
      ctx
    } = createDeps()

    const session = createEdgeRoutePressSession(ctx, createStart() as never, {
      kind: 'insert',
      edgeId: 'edge-1',
      index: 1,
      pointerId: 1,
      startWorld: { x: 50, y: 10 },
      origin: { x: 50, y: 10 },
      point: { x: 50, y: 10 }
    })

    const transition = session.move?.({
      pointerId: 1,
      client: { x: 80, y: 30 }
    } as never)

    expect(transition?.kind).toBe('replace')
    if (!transition || transition.kind !== 'replace') {
      return
    }

    transition.session.up?.({
      client: { x: 80, y: 30 }
    } as never)

    expect(setRoute).toHaveBeenCalledTimes(1)
    expect(setRoute).toHaveBeenCalledWith('edge-1', {
      kind: 'manual',
      points: [
        { x: 20, y: 20 },
        { x: 80, y: 30 }
      ]
    })
    expect(insertRoute).not.toHaveBeenCalled()
    expect(updateRoute).not.toHaveBeenCalled()
  })
})
