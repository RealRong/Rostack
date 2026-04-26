import {
  planMindmapInsertByPlacement,
  planMindmapRootMove,
  planMindmapSubtreeMove,
  DEFAULT_ROOT_MOVE_THRESHOLD
} from '@whiteboard/core/mindmap/application'
import {
  addChild,
  cloneSubtree,
  createMindmap,
  insertNode,
  moveSubtree,
  patchMindmap,
  removeSubtree
} from '@whiteboard/core/mindmap/treeMutate'
import {
  computeSubtreeDropTarget,
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag
} from '@whiteboard/core/mindmap/dropTarget'
import {
  buildMindmapRelativeInsertInput,
  readMindmapAddChildTargets,
  resolveMindmapInsertSide,
  toMindmapTopicStylePatch
} from '@whiteboard/core/mindmap/query'
import {
  layoutMindmap,
  layoutMindmapTidy
} from '@whiteboard/core/mindmap/layout'
import { createMindmapOp } from '@whiteboard/core/mindmap/ops'
import {
  anchorMindmapLayout,
  resolveMindmapRender,
  translateMindmapLayout
} from '@whiteboard/core/mindmap/render'
import {
  computeMindmapLayout,
  getMindmapIdByNode,
  getMindmapRecordByNodeId,
  getMindmapTree,
  getMindmapTreeFromDocument,
  resolveMindmapId,
  getSide,
  getSubtreeIds,
  readMindmapNavigateTarget,
  resolveInsertPlan,
  toMindmapTree
} from '@whiteboard/core/mindmap/tree'
import {
  cloneMindmapTemplate,
  createBlankMindmapTemplate,
  createMindmapTree,
  DEFAULT_MINDMAP_BRANCH_STYLE,
  instantiateBlankMindmap,
  instantiateMindmapTemplate
} from '@whiteboard/core/mindmap/template'
import { buildMindmapTextNodeStyle } from '@whiteboard/core/mindmap/types'

export const mindmap = {
  tree: {
    create: createMindmap,
    addChild,
    insertNode,
    moveSubtree,
    removeSubtree,
    cloneSubtree,
    patch: patchMindmap,
    fromRecord: toMindmapTree,
    fromDocument: getMindmapTreeFromDocument,
    get: getMindmapTree,
    resolveId: resolveMindmapId,
    byNode: getMindmapIdByNode,
    idByNode: getMindmapIdByNode,
    recordByNodeId: getMindmapRecordByNodeId,
    subtreeIds: getSubtreeIds,
    side: getSide,
    navigate: readMindmapNavigateTarget
  },
  plan: {
    defaultRootMoveThreshold: DEFAULT_ROOT_MOVE_THRESHOLD,
    insertByPlacement: planMindmapInsertByPlacement,
    insertTarget: resolveInsertPlan,
    rootMove: planMindmapRootMove,
    subtreeMove: planMindmapSubtreeMove
  },
  layout: {
    compute: computeMindmapLayout,
    classic: layoutMindmap,
    tidy: layoutMindmapTidy,
    translate: translateMindmapLayout,
    anchor: anchorMindmapLayout
  },
  op: {
    create: createMindmapOp
  },
  template: {
    defaultBranchStyle: DEFAULT_MINDMAP_BRANCH_STYLE,
    clone: cloneMindmapTemplate,
    createBlank: createBlankMindmapTemplate,
    createTree: createMindmapTree,
    instantiate: instantiateMindmapTemplate,
    instantiateBlank: instantiateBlankMindmap,
    textNodeStyle: buildMindmapTextNodeStyle
  },
  render: {
    resolve: resolveMindmapRender,
    translateLayout: translateMindmapLayout,
    anchorLayout: anchorMindmapLayout
  },
  drop: {
    computeSubtreeTarget: computeSubtreeDropTarget,
    createRootDrag,
    createSubtreeDrag,
    projectDrag: projectMindmapDrag
  },
  addChildTargets: readMindmapAddChildTargets,
  insert: {
    resolveSide: resolveMindmapInsertSide,
    buildRelative: buildMindmapRelativeInsertInput
  },
  topicStyle: {
    toNodeStylePatch: toMindmapTopicStylePatch
  }
} as const

export type * from '@whiteboard/core/mindmap/types'
export type { MindmapRenderConnector } from '@whiteboard/core/mindmap/render'
export type {
  MindmapConnectionLine,
  MindmapDragState,
  MindmapInsertPlacement,
  MindmapInsertPlan,
  RootMindmapDrag,
  SubtreeDropTargetOptions,
  SubtreeMindmapDrag
} from '@whiteboard/core/types/mindmap'
