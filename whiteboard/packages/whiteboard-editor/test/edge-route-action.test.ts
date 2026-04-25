import { describe, expect, it, vi } from 'vitest'
import type { Edge } from '@whiteboard/core/types'
import {
  createEditorActionsApi
} from '../src/action'
import { createToolService } from '../src/services/tool'

const okResult = () => ({ ok: true }) as const

const createEdge = (): Edge => ({
  id: 'edge-1',
  type: 'straight',
  source: {
    kind: 'point',
    point: { x: 0, y: 0 }
  },
  target: {
    kind: 'point',
    point: { x: 100, y: 20 }
  },
  route: {
    kind: 'manual',
    points: [{
      id: 'point-1',
      x: 20,
      y: 20
    }]
  }
})

const createActions = (edge = createEdge()) => {
  const setRoute = vi.fn(() => okResult())
  const insertRoute = vi.fn(() => ({ ok: true, data: { pointId: 'unused' } }))
  const updateRoute = vi.fn(() => okResult())
  const deleteRoute = vi.fn(() => okResult())
  const clearRoute = vi.fn(() => okResult())

  const document = {
    nodes: {
      get: vi.fn(() => undefined),
      ids: vi.fn(() => [])
    },
    edges: {
      get: vi.fn((edgeId: string) => (
        edgeId === edge.id
          ? { edge }
          : undefined
      )),
      ids: vi.fn(() => [])
    },
    group: {
      exact: vi.fn(() => []),
      target: vi.fn(() => undefined)
    },
    mindmap: {
      structure: {
        get: vi.fn(() => undefined)
      }
    },
    slice: {
      fromSelection: vi.fn(() => undefined)
    }
  } as never
  const session = {
    mutate: {
      tool: {
        set: vi.fn()
      },
      draw: {
        set: vi.fn(),
        slot: vi.fn(),
        patch: vi.fn()
      },
      selection: {
        replace: vi.fn(() => true),
        add: vi.fn(() => true),
        remove: vi.fn(() => true),
        toggle: vi.fn(() => true),
        clear: vi.fn(() => true)
      },
      edit: {
        set: vi.fn(),
        input: vi.fn(),
        caret: vi.fn(),
        composing: vi.fn(),
        clear: vi.fn()
      }
    },
    state: {
      tool: {
        get: vi.fn(() => ({ type: 'select' }))
      },
      selection: {
        get: vi.fn(() => ({
          nodeIds: [],
          edgeIds: []
        }))
      },
      edit: {
        get: vi.fn(() => undefined)
      }
    },
    preview: {
      state: {
        get: vi.fn(() => ({
          mindmap: {
            preview: undefined
          }
        }))
      }
    },
    viewport: {
      commands: {
        set: vi.fn(),
        panBy: vi.fn(),
        zoomTo: vi.fn(),
        fit: vi.fn(),
        reset: vi.fn()
      },
      setRect: vi.fn(),
      setLimits: vi.fn(),
      read: {
        get: vi.fn(() => ({
          center: { x: 0, y: 0 },
          zoom: 1
        }))
      }
    }
  } as never
  const graph = {
    node: {
      get: vi.fn(() => undefined)
    },
    edge: {
      model: vi.fn((edgeId: string) => (
        edgeId === edge.id
          ? edge
          : undefined
      ))
    },
    mindmap: {
      view: {
        get: vi.fn(() => undefined)
      }
    }
  } as never
  const layout = {
    draft: {
      node: {
        get: vi.fn(() => undefined)
      }
    }
  } as never
  const write = {
    document: {
      replace: vi.fn(),
      insert: vi.fn()
    },
    canvas: {
      delete: vi.fn(),
      duplicate: vi.fn(),
      selection: {
        move: vi.fn()
      },
      order: {
        move: vi.fn()
      }
    },
    node: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      move: vi.fn(),
      align: vi.fn(),
      distribute: vi.fn(),
      delete: vi.fn(),
      deleteCascade: vi.fn(),
      duplicate: vi.fn(),
      lock: {
        set: vi.fn(),
        toggle: vi.fn()
      },
      shape: {
        set: vi.fn()
      },
      style: {
        fill: vi.fn(),
        fillOpacity: vi.fn(),
        stroke: vi.fn(),
        strokeWidth: vi.fn(),
        strokeOpacity: vi.fn(),
        strokeDash: vi.fn(),
        opacity: vi.fn(),
        textColor: vi.fn()
      },
      text: {
        commit: vi.fn(),
        color: vi.fn(),
        size: vi.fn(),
        weight: vi.fn(),
        italic: vi.fn(),
        align: vi.fn()
      }
    },
    group: {
      merge: vi.fn(),
      ungroup: vi.fn(),
      order: {
        move: vi.fn()
      }
    },
    edge: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      reconnectCommit: vi.fn(),
      delete: vi.fn(),
      route: {
        set: setRoute,
        update: updateRoute,
        clear: clearRoute
      },
      label: {
        insert: vi.fn(),
        update: vi.fn(),
        move: vi.fn(),
        delete: vi.fn()
      },
      style: {
        color: vi.fn(),
        opacity: vi.fn(),
        width: vi.fn(),
        dash: vi.fn(),
        start: vi.fn(),
        end: vi.fn(),
        swapMarkers: vi.fn()
      },
      type: {
        set: vi.fn()
      },
      lock: {
        set: vi.fn(),
        toggle: vi.fn()
      },
      textMode: {
        set: vi.fn()
      }
    },
    mindmap: {
      create: vi.fn(),
      delete: vi.fn(),
      layout: {
        set: vi.fn()
      },
      root: {
        move: vi.fn()
      },
      branch: {
        update: vi.fn()
      },
      topic: {
        insert: vi.fn(),
        move: vi.fn(),
        delete: vi.fn(),
        clone: vi.fn(),
        update: vi.fn()
      }
    },
    history: {
      undo: vi.fn(),
      redo: vi.fn(),
      clear: vi.fn()
    }
  } as never
  const boundary = {
    atomic: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => TResult) => (
      ...args: TArgs
    ) => fn(...args),
    procedure: <TArgs extends unknown[], TResult>(fn: (...args: TArgs) => Generator<unknown, TResult, unknown>) => (
      ...args: TArgs
    ) => {
      const procedure = fn(...args)
      let step = procedure.next()

      while (!step.done) {
        throw new Error(`Unexpected procedure signal: ${(step.value as { kind?: string })?.kind ?? 'unknown'}`)
      }

      return step.value
    }
  } as const
  const actions = createEditorActionsApi({
    boundary,
    engine: {
      current: vi.fn(() => ({
        snapshot: {},
        change: {}
      }))
    } as never,
    document,
    session,
    graph,
    layout,
    tool: createToolService({
      session
    }),
    write,
    registry: {
      get: vi.fn(() => undefined)
    } as never,
    defaults: {
      frame: vi.fn()
    } as never
  })

  return {
    actions,
    setRoute,
    insertRoute,
    updateRoute,
    deleteRoute,
    clearRoute
  }
}

describe('edge route actions', () => {
  it('inserts a route point through route.set semantics', () => {
    const {
      actions,
      setRoute,
      insertRoute,
      updateRoute,
      deleteRoute
    } = createActions()

    actions.edge.route.insertPoint('edge-1', 1, {
      x: 50,
      y: 10
    })

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
    expect(deleteRoute).not.toHaveBeenCalled()
  })

  it('moves a route point through route.set semantics', () => {
    const {
      actions,
      setRoute,
      insertRoute,
      updateRoute,
      deleteRoute,
      clearRoute
    } = createActions()

    actions.edge.route.movePoint('edge-1', 0, {
      x: 60,
      y: 12
    })

    expect(setRoute).toHaveBeenCalledTimes(1)
    expect(setRoute).toHaveBeenCalledWith('edge-1', {
      kind: 'manual',
      points: [{
        x: 60,
        y: 12
      }]
    })
    expect(insertRoute).not.toHaveBeenCalled()
    expect(updateRoute).not.toHaveBeenCalled()
    expect(deleteRoute).not.toHaveBeenCalled()
    expect(clearRoute).not.toHaveBeenCalled()
  })

  it('removes a route point through route.set semantics', () => {
    const {
      actions,
      setRoute,
      insertRoute,
      updateRoute,
      deleteRoute,
      clearRoute
    } = createActions()

    actions.edge.route.removePoint('edge-1', 0)

    expect(setRoute).toHaveBeenCalledTimes(1)
    expect(setRoute).toHaveBeenCalledWith('edge-1', {
      kind: 'auto'
    })
    expect(insertRoute).not.toHaveBeenCalled()
    expect(updateRoute).not.toHaveBeenCalled()
    expect(deleteRoute).not.toHaveBeenCalled()
    expect(clearRoute).not.toHaveBeenCalled()
  })
})
