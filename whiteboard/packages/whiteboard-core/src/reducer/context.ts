import type { ReducerContext } from '@shared/reducer'
import {
  createHistoryKeyCollector,
  type HistoryFootprint,
  type HistoryKeyCollector
} from '@whiteboard/core/spec/history'
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
  const prefix: Operation[] = []
  const suffix: Operation[] = []

  return {
    prepend: (op: Operation) => {
      prefix.push(op)
      base.inverse(op)
    },
    prependMany: (ops: readonly Operation[]) => {
      for (let index = ops.length - 1; index >= 0; index -= 1) {
        const op = ops[index]
        if (op !== undefined) {
          prefix.push(op)
        }
      }
      base.inverseMany(ops)
    },
    append: (_op: Operation) => {
      throw new Error('Whiteboard reducer internal append is not supported.')
    },
    appendMany: (_ops: readonly Operation[]) => {
      throw new Error('Whiteboard reducer internal appendMany is not supported.')
    },
    isEmpty: () => prefix.length === 0 && suffix.length === 0,
    clear: () => {
      prefix.length = 0
      suffix.length = 0
    },
    finish: () => [
      ...prefix.slice().reverse(),
      ...suffix
    ]
  }
}

const createMirroredFootprint = (
  base: BaseReduceContext
): HistoryKeyCollector => {
  const collector = createHistoryKeyCollector()

  const add = (
    key: HistoryFootprint[number]
  ) => {
    collector.add(key)
    base.footprint(key)
  }

  return {
    add,
    addMany: (keys: Iterable<HistoryFootprint[number]>) => {
      for (const key of keys) {
        add(key)
      }
    },
    has: (key: HistoryFootprint[number]) => collector.has(key),
    finish: () => collector.finish(),
    clear: () => {
      collector.clear()
    }
  }
}

export const createWhiteboardReduceContext = (
  base: BaseReduceContext
): WhiteboardReduceCtx => {
  const state: WhiteboardReduceState = {
    base: base.base,
    draft: createDraftDocument(base.base),
    inverse: createMirroredInverse(base),
    footprint: createMirroredFootprint(base),
    changes: createChangeSet(),
    invalidation: createInvalidation(),
    queue: {
      mindmapLayout: [],
      mindmapLayoutSet: new Set()
    }
  }

  let ctx!: WhiteboardReduceContextInternal
  ctx = {
    base: base.base,
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
        state.footprint.add(key)
      },
      addMany: (keys) => {
        state.footprint.addMany(keys)
      }
    },
    issue: (code, message, details) => {
      base.issue({
        code,
        message,
        ...(details === undefined
          ? {}
          : {
              details
            })
      })
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
    stop: () => base.stop(),
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
