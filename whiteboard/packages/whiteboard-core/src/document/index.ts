import { assertDocument } from '@whiteboard/core/document/assert'
import { createDocument } from '@whiteboard/core/document/model'
import {
  getEdge,
  getGroup,
  getMindmap,
  getNode,
  hasEdge,
  hasGroup,
  hasNode,
  listCanvasItemRefs,
  listEdges,
  listGroupCanvasItemRefs,
  listGroupEdgeIds,
  listGroupNodeIds,
  listGroups,
  listNodes
} from '@whiteboard/core/document/query'
import {
  buildInsertSliceOperations,
  exportSliceFromEdge,
  exportSliceFromNodes,
  exportSliceFromSelection,
  getSliceBounds,
  translateSlice
} from '@whiteboard/core/document/slice'

export const document = {
  create: createDocument,
  assert: assertDocument,
  read: {
    node: getNode,
    edge: getEdge,
    group: getGroup,
    mindmap: getMindmap
  },
  has: {
    node: hasNode,
    edge: hasEdge,
    group: hasGroup
  },
  list: {
    nodes: listNodes,
    edges: listEdges,
    groups: listGroups,
    canvasRefs: listCanvasItemRefs,
    groupCanvasRefs: listGroupCanvasItemRefs,
    groupNodeIds: listGroupNodeIds,
    groupEdgeIds: listGroupEdgeIds
  },
  slice: {
    bounds: getSliceBounds,
    translate: translateSlice,
    export: {
      nodes: exportSliceFromNodes,
      edge: exportSliceFromEdge,
      selection: exportSliceFromSelection
    },
    buildInsertOps: buildInsertSliceOperations
  }
} as const

export type {
  Slice,
  SliceExportResult,
  SliceInsertOptions,
  SliceInsertResult,
  SliceRoots
} from '@whiteboard/core/types/document'
