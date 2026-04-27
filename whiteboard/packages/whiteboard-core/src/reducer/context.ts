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
  restoreEdge,
  setEdgeFieldValue,
  setEdgeLabelField,
  setEdgeLabelRecord,
  setEdgeRecord,
  setEdgeRoutePointField,
  unsetEdgeFieldValue,
  unsetEdgeLabelField,
  unsetEdgeLabelRecord,
  unsetEdgeRecord
} from './internal/edge'
import {
  createGroup,
  deleteGroup,
  restoreGroup,
  setGroupFieldValue,
  unsetGroupFieldValue
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
  restoreMindmap,
  restoreMindmapTopic,
  setMindmapBranchField,
  setMindmapTopicCollapsed,
  setMindmapTopicField,
  setMindmapTopicRecord,
  unsetMindmapBranchField,
  unsetMindmapTopicField,
  unsetMindmapTopicRecord
} from './internal/mindmap'
import {
  createNode,
  deleteNode,
  restoreNode,
  setNodeFieldValue,
  setNodeRecord,
  unsetNodeFieldValue,
  unsetNodeRecord
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
      setField: (id, field, value) => {
        setNodeFieldValue(state, id, field, value)
      },
      unsetField: (id, field) => {
        unsetNodeFieldValue(state, id, field)
      },
      setRecord: (id, scope, path, value) => {
        setNodeRecord(state, id, scope, path, value)
      },
      unsetRecord: (id, scope, path) => {
        unsetNodeRecord(state, id, scope, path)
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
      setField: (id, field, value) => {
        setEdgeFieldValue(state, id, field, value)
      },
      unsetField: (id, field) => {
        unsetEdgeFieldValue(state, id, field)
      },
      setRecord: (id, scope, path, value) => {
        setEdgeRecord(state, id, scope, path, value)
      },
      unsetRecord: (id, scope, path) => {
        unsetEdgeRecord(state, id, scope, path)
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
      setLabelField: (edgeId, labelId, field, value) => {
        setEdgeLabelField(state, edgeId, labelId, field, value)
      },
      unsetLabelField: (edgeId, labelId, field) => {
        unsetEdgeLabelField(state, edgeId, labelId, field)
      },
      setLabelRecord: (edgeId, labelId, scope, path, value) => {
        setEdgeLabelRecord(state, edgeId, labelId, scope, path, value)
      },
      unsetLabelRecord: (edgeId, labelId, scope, path) => {
        unsetEdgeLabelRecord(state, edgeId, labelId, scope, path)
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
      setRoutePointField: (edgeId, pointId, field, value) => {
        setEdgeRoutePointField(state, edgeId, pointId, field, value)
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
      setField: (id, field, value) => {
        setGroupFieldValue(state, id, field, value)
      },
      unsetField: (id, field) => {
        unsetGroupFieldValue(state, id, field)
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
      setTopicField: (id, topicId, field, value) => {
        setMindmapTopicField(state, id, topicId, field, value)
      },
      unsetTopicField: (id, topicId, field) => {
        unsetMindmapTopicField(state, id, topicId, field)
      },
      setTopicRecord: (id, topicId, scope, path, value) => {
        setMindmapTopicRecord(state, id, topicId, scope, path, value)
      },
      unsetTopicRecord: (id, topicId, scope, path) => {
        unsetMindmapTopicRecord(state, id, topicId, scope, path)
      },
      setBranchField: (id, topicId, field, value) => {
        setMindmapBranchField(state, id, topicId, field, value)
      },
      unsetBranchField: (id, topicId, field) => {
        unsetMindmapBranchField(state, id, topicId, field)
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
