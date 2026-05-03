import { describe, expect, it, vi } from 'vitest'
import { entityTable } from '@shared/core'
import type { Edge } from '@whiteboard/core/types'
import {
  createEditorActionsApi
} from '../src/actions'
import { EMPTY_PREVIEW_STATE } from '../src/state/preview'
import { DEFAULT_DRAW_STATE } from '../src/schema/draw-state'
import { createEditorTaskRuntime } from '../src/tasks/runtime'

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
  points: entityTable.normalize.list([{
      id: 'point-1',
      x: 20,
      y: 20
    }])
})

const createActions = (edge = createEdge()) => {
  const setPoints = vi.fn(() => okResult())
  const insertPoints = vi.fn(() => ({ ok: true, data: { pointId: 'unused' } }))
  const updatePoints = vi.fn(() => okResult())
  const deletePoints = vi.fn(() => okResult())
  const clearPoints = vi.fn(() => okResult())

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
  const graph = {
    nodes: {
      get: vi.fn(() => undefined)
    },
    edges: {
      get: vi.fn((edgeId: string) => (
        edgeId === edge.id
          ? {
              base: {
                edge
              }
            }
          : undefined
      ))
    },
    mindmaps: {
      get: vi.fn(() => undefined),
      id: vi.fn(() => undefined),
      structure: vi.fn(() => undefined),
      tree: vi.fn(() => undefined)
    },
    groups: {
      exact: vi.fn(() => []),
      target: vi.fn(() => undefined)
    }
  } as never
  const state = {
    read: vi.fn(() => ({
      state: {
        tool: { type: 'select' },
        draw: DEFAULT_DRAW_STATE,
        selection: {
          nodeIds: [],
          edgeIds: []
        },
        edit: null
      },
      hover: {
        target: null,
        anchor: null
      },
      preview: EMPTY_PREVIEW_STATE
    })),
    write: vi.fn((run: (context: {
      writer: {
        selection: {
          set: (selection: {
            nodeIds: readonly string[]
            edgeIds: readonly string[]
          }) => void
        }
        edit: {
          clear: () => void
          set: (edit: unknown) => void
        }
        tool: {
          set: (tool: unknown) => void
        }
        draw: {
          set: (draw: unknown) => void
          slot: (brush: unknown, slot: unknown) => void
          patch: (patch: unknown) => void
        }
        hover: {
          set: (hover: unknown) => void
          clear: () => void
        }
        preview: {
          reset: () => void
          edgeGuide: {
            set: (value: unknown) => void
            clear: () => void
          }
        }
      }
      snapshot: ReturnType<typeof state.read>
    }) => void) => {
      run({
        writer: {
          selection: {
            set: vi.fn()
          },
          edit: {
            clear: vi.fn(),
            set: vi.fn()
          },
          tool: {
            set: vi.fn()
          },
          draw: {
            set: vi.fn(),
            slot: vi.fn(),
            patch: vi.fn()
          },
          hover: {
            set: vi.fn(),
            clear: vi.fn()
          },
          preview: {
            reset: vi.fn(),
            edgeGuide: {
              set: vi.fn(),
              clear: vi.fn()
            }
          }
        },
        snapshot: state.read()
      })
    })
  } as never
  const viewport = {
    get: vi.fn(() => ({
      center: { x: 0, y: 0 },
      zoom: 1
    })),
    set: vi.fn(),
    panBy: vi.fn(),
    panScreenBy: vi.fn(),
    zoomTo: vi.fn(),
    fit: vi.fn(),
    reset: vi.fn(),
    wheel: vi.fn()
  } as never
  const editor = {
    tool: {
      get: vi.fn(() => ({ type: 'select' }))
    },
    draw: {
      get: vi.fn(() => DEFAULT_DRAW_STATE)
    },
    edit: {
      get: vi.fn(() => null)
    },
    selection: {
      get: vi.fn(() => ({
        nodeIds: [],
        edgeIds: []
      }))
    },
    preview: {
      get: vi.fn(() => EMPTY_PREVIEW_STATE)
    },
    state,
    viewport
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
      points: {
        set: setPoints,
        update: updatePoints,
        clear: clearPoints
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
  const tasks = createEditorTaskRuntime()
  const actions = createEditorActionsApi({
    document,
    projection: graph,
    state,
    stores: {
      tool: editor.tool,
      draw: editor.draw,
      selection: editor.selection,
      edit: editor.edit,
      preview: editor.preview
    },
    viewport,
    tasks,
    write,
    nodeType: {
      edit: vi.fn(() => undefined)
    } as never,
    defaults: {
      frame: vi.fn()
    } as never
  })

  return {
    actions,
    dispose: () => {
      tasks.dispose()
    },
    setPoints,
    insertPoints,
    updatePoints,
    deletePoints,
    clearPoints
  }
}

describe('edge points actions', () => {
  it('inserts a point through points.set semantics', () => {
    const {
      actions,
      setPoints,
      insertPoints,
      updatePoints,
      deletePoints
    } = createActions()

    actions.document.edge.points.insertPoint('edge-1', 1, {
      x: 50,
      y: 10
    })

    expect(setPoints).toHaveBeenCalledTimes(1)
    expect(setPoints).toHaveBeenCalledWith('edge-1', [
      { x: 20, y: 20 },
      { x: 50, y: 10 }
    ])
    expect(insertPoints).not.toHaveBeenCalled()
    expect(updatePoints).not.toHaveBeenCalled()
    expect(deletePoints).not.toHaveBeenCalled()
  })

  it('moves a point through points.set semantics', () => {
    const {
      actions,
      setPoints,
      insertPoints,
      updatePoints,
      deletePoints,
      clearPoints
    } = createActions()

    actions.document.edge.points.movePoint('edge-1', 0, {
      x: 60,
      y: 12
    })

    expect(setPoints).toHaveBeenCalledTimes(1)
    expect(setPoints).toHaveBeenCalledWith('edge-1', [{
        x: 60,
        y: 12
      }])
    expect(insertPoints).not.toHaveBeenCalled()
    expect(updatePoints).not.toHaveBeenCalled()
    expect(deletePoints).not.toHaveBeenCalled()
    expect(clearPoints).not.toHaveBeenCalled()
  })

  it('removes a point through points.set semantics', () => {
    const {
      actions,
      setPoints,
      insertPoints,
      updatePoints,
      deletePoints,
      clearPoints
    } = createActions()

    actions.document.edge.points.removePoint('edge-1', 0)

    expect(setPoints).toHaveBeenCalledTimes(1)
    expect(setPoints).toHaveBeenCalledWith('edge-1', undefined)
    expect(insertPoints).not.toHaveBeenCalled()
    expect(updatePoints).not.toHaveBeenCalled()
    expect(deletePoints).not.toHaveBeenCalled()
    expect(clearPoints).not.toHaveBeenCalled()
  })
})
