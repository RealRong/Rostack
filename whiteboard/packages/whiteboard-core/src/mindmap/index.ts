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
  moveSubtree,
  patchMindmapTree,
  removeSubtree
} from '@whiteboard/core/mindmap/commands'
import {
  computeSubtreeDropTarget,
  createRootDrag,
  createSubtreeDrag,
  projectMindmapDrag
} from '@whiteboard/core/mindmap/dropTarget'
import {
  layoutMindmap,
  layoutMindmapTidy
} from '@whiteboard/core/mindmap/layout'
import {
  anchorMindmapLayout,
  resolveMindmapRender,
  translateMindmapLayout
} from '@whiteboard/core/mindmap/render'
import {
  computeMindmapLayout,
  createMindmapCreateOp,
  getMindmapIdByNode,
  getMindmapRecordByNodeId,
  getMindmapTree,
  getMindmapTreeFromDocument,
  getSide,
  getSubtreeIds,
  resolveInsertPlan,
  toMindmapTree
} from '@whiteboard/core/mindmap/query'
import {
  cloneMindmapTemplate,
  createBlankMindmapTemplate,
  createMindmapTree,
  DEFAULT_MINDMAP_BRANCH_STYLE,
  instantiateBlankMindmap,
  instantiateMindmapTemplate
} from '@whiteboard/core/mindmap/template'

export const mindmap = {
  tree: {
    create: createMindmap,
    fromRecord: toMindmapTree,
    fromDocument: getMindmapTreeFromDocument,
    get: getMindmapTree,
    idByNode: getMindmapIdByNode,
    recordByNodeId: getMindmapRecordByNodeId,
    subtreeIds: getSubtreeIds,
    side: getSide
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
  command: {
    buildCreate: createMindmapCreateOp,
    addChild,
    moveSubtree,
    removeSubtree,
    cloneSubtree,
    patchTree: patchMindmapTree
  },
  template: {
    defaultBranchStyle: DEFAULT_MINDMAP_BRANCH_STYLE,
    clone: cloneMindmapTemplate,
    createBlank: createBlankMindmapTemplate,
    createTree: createMindmapTree,
    instantiate: instantiateMindmapTemplate,
    instantiateBlank: instantiateBlankMindmap
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
  }
} as const

export type * from '@whiteboard/core/mindmap/types'
export type {
  MindmapConnectionLine,
  MindmapDragState,
  MindmapInsertPlacement,
  MindmapInsertPlan,
  RootMindmapDrag,
  SubtreeDropTargetOptions,
  SubtreeMindmapDrag
} from '@whiteboard/core/types/mindmap'
