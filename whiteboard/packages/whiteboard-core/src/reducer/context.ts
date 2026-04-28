import type { ReducerContext } from '@shared/reducer'
import {
  type HistoryFootprint
} from '@whiteboard/core/operations/history'
import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'
import {
  moveCanvasItems
} from './internal/canvas'
import {
  replaceDocument,
  setDocumentBackground
} from './internal/document'
import {
  createEdge,
  deleteEdge,
  deleteEdgeLabel,
  deleteEdgeRoutePoint,
  insertEdgeLabel,
  insertEdgeRoutePoint,
  moveEdgeLabel,
  moveEdgeRoutePoint,
  patchEdge,
  patchEdgeLabel,
  patchEdgeRoutePoint,
  restoreEdge,
} from './internal/edge'
import {
  createGroup,
  deleteGroup,
  patchGroup,
  restoreGroup,
} from './internal/group'
import {
  createMindmap,
  deleteMindmap,
  deleteMindmapTopic,
  flushMindmapLayout,
  insertMindmapTopic,
  moveMindmapRoot,
  moveMindmapTopic,
  patchMindmapLayout,
  patchMindmapBranch,
  patchMindmapTopic,
  restoreMindmap,
  restoreMindmapTopic,
  setMindmapTopicCollapsed,
} from './internal/mindmap'
import {
  createNode,
  deleteNode,
  patchNode,
  restoreNode,
} from './internal/node'
import {
  createChangeSet,
  createDraftDocument,
  createInvalidation,
  type WhiteboardInverse,
  type WhiteboardReduceState
} from './internal/state'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
} from './types'

const INTERNAL = Symbol('whiteboard.reducer.internal')

type BaseReduceContext = ReducerContext<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceIssueCode
>

type WhiteboardReduceInternal = {
  base: BaseReduceContext
  state: WhiteboardReduceState
}

type WhiteboardReduceContextInternal = WhiteboardReduceCtx & {
  [INTERNAL]: WhiteboardReduceInternal
}

const toWhiteboardOrigin = (
  origin: string
): Origin => (
  origin === 'remote' || origin === 'system'
    ? origin
    : 'user'
)

const createMirroredInverse = (
  base: BaseReduceContext
): WhiteboardInverse<Operation> => {
  return {
    prepend: (op: Operation) => {
      base.inverseMany([op])
    },
    prependMany: (ops: readonly Operation[]) => {
      base.inverseMany(ops)
    }
  }
}

export const createWhiteboardReduceContext = (
  base: BaseReduceContext
): WhiteboardReduceCtx => {
  const state: WhiteboardReduceState = {
    draft: createDraftDocument(base.doc()),
    inverse: createMirroredInverse(base),
    changes: createChangeSet(),
    invalidation: createInvalidation(),
    replaced: false,
    queue: {
      mindmapLayout: [],
      mindmapLayoutSet: new Set()
    }
  }

  let ctx!: WhiteboardReduceContextInternal
  ctx = {
    origin: toWhiteboardOrigin(base.origin),
    document: {
      replace: (document) => {
        replaceDocument(state, document)
      },
      setBackground: (background) => {
        setDocumentBackground(state, background)
      }
    },
    canvas: {
      move: (refs, to) => {
        moveCanvasItems(state, refs, to)
      }
    },
    node: {
      create: (node) => {
        createNode(state, node)
      },
      restore: (node, slot) => {
        restoreNode(state, node, slot)
      },
      patch: (id, input) => {
        patchNode(state, id, input)
      },
      delete: (id) => {
        deleteNode(state, id)
      }
    },
    edge: {
      create: (edge) => {
        createEdge(state, edge)
      },
      restore: (edge, slot) => {
        restoreEdge(state, edge, slot)
      },
      patch: (id, input) => {
        patchEdge(state, id, input)
      },
      insertLabel: (edgeId, label, to) => {
        insertEdgeLabel(state, edgeId, label, to)
      },
      deleteLabel: (edgeId, labelId) => {
        deleteEdgeLabel(state, edgeId, labelId)
      },
      moveLabel: (edgeId, labelId, to) => {
        moveEdgeLabel(state, edgeId, labelId, to)
      },
      patchLabel: (edgeId, labelId, input) => {
        patchEdgeLabel(state, edgeId, labelId, input)
      },
      insertRoutePoint: (edgeId, point, to) => {
        insertEdgeRoutePoint(state, edgeId, point, to)
      },
      deleteRoutePoint: (edgeId, pointId) => {
        deleteEdgeRoutePoint(state, edgeId, pointId)
      },
      moveRoutePoint: (edgeId, pointId, to) => {
        moveEdgeRoutePoint(state, edgeId, pointId, to)
      },
      patchRoutePoint: (edgeId, pointId, fields) => {
        patchEdgeRoutePoint(state, edgeId, pointId, fields)
      },
      delete: (id) => {
        deleteEdge(state, id)
      }
    },
    group: {
      create: (group) => {
        createGroup(state, group)
      },
      restore: (group) => {
        restoreGroup(state, group)
      },
      patch: (id, fields) => {
        patchGroup(state, id, fields)
      },
      delete: (id) => {
        deleteGroup(state, id)
      }
    },
    mindmap: {
      create: (input) => {
        createMindmap(state, input)
      },
      restore: (snapshot) => {
        restoreMindmap(state, snapshot)
      },
      delete: (id) => {
        deleteMindmap(state, id)
      },
      moveRoot: (id, position) => {
        moveMindmapRoot(state, id, position)
      },
      patchLayout: (id, patch) => {
        patchMindmapLayout(state, id, patch)
      },
      insertTopic: (input) => {
        insertMindmapTopic(state, input)
      },
      restoreTopic: (input) => {
        restoreMindmapTopic(state, input)
      },
      moveTopic: (input) => {
        moveMindmapTopic(state, input)
      },
      deleteTopic: (input) => {
        deleteMindmapTopic(state, input)
      },
      patchTopic: (id, topicId, input) => {
        patchMindmapTopic(state, id, topicId, input)
      },
      patchBranch: (id, topicId, fields) => {
        patchMindmapBranch(state, id, topicId, fields)
      },
      setTopicCollapsed: (id, topicId, collapsed) => {
        setMindmapTopicCollapsed(state, id, topicId, collapsed)
      },
      flush: () => {
        const result = flushMindmapLayout(state)
        if (!result.ok) {
          ctx.fail(result.error.code, result.error.message, result.error.details)
        }
      }
    },
    history: {
      add: (key) => {
        base.footprint(key)
      },
      addMany: (keys) => {
        for (const key of keys) {
          base.footprint(key)
        }
      }
    },
    fail: (code, message, details) => base.fail({
      code,
      message,
      ...(details === undefined
        ? {}
        : {
            details
          })
    }),
    [INTERNAL]: {
      base,
      state
    }
  }

  return ctx
}

export const readWhiteboardReduceInternal = (
  ctx: WhiteboardReduceCtx
): WhiteboardReduceInternal => (
  ctx as WhiteboardReduceContextInternal
)[INTERNAL]
