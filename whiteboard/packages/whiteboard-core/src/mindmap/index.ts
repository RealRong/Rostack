import {
  planMindmapInsertByPlacement,
  planMindmapRootMove,
  planMindmapSubtreeMove,
  DEFAULT_ROOT_MOVE_THRESHOLD,
  buildMindmapRelativeInsertInput,
  readMindmapAddChildTargets,
  resolveMindmapInsertSide,
  toMindmapTopicStylePatch
} from '@whiteboard/core/mindmap/plan'
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
  createMindmapTopicPatch,
  readMindmapTopicUpdateFromPatch
} from '@whiteboard/core/mindmap/ops'
import {
  anchorMindmapLayout,
  resolveMindmapRender,
  translateMindmapLayout
} from '@whiteboard/core/mindmap/render'
import {
  addChild,
  cloneSubtree,
  computeMindmapLayout,
  createMindmap,
  getMindmapIdByNode,
  getMindmapRecordByNodeId,
  getMindmapTree,
  getMindmapTreeFromDocument,
  getSide,
  getSubtreeIds,
  insertNode,
  moveSubtree,
  patchMindmap,
  readMindmapNavigateTarget,
  removeSubtree,
  resolveInsertPlan,
  resolveMindmapId,
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
import {
  applySubtreeMovePreview,
  equalMindmapLayout,
  resolveProjectedMindmapLayout
} from '@whiteboard/core/mindmap/project'

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
    subtreeMove: planMindmapSubtreeMove,
    addChildTargets: readMindmapAddChildTargets,
    insertSide: resolveMindmapInsertSide,
    relativeInsertInput: buildMindmapRelativeInsertInput
  },
  layout: {
    compute: computeMindmapLayout,
    classic: layoutMindmap,
    tidy: layoutMindmapTidy,
    translate: translateMindmapLayout,
    anchor: anchorMindmapLayout
  },
  project: {
    layout: resolveProjectedMindmapLayout,
    previewSubtree: applySubtreeMovePreview,
    equalLayout: equalMindmapLayout
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
  topicStyle: {
    toNodeStylePatch: toMindmapTopicStylePatch
  },
  topic: {
    patch: {
      toPatch: createMindmapTopicPatch,
      fromPatch: readMindmapTopicUpdateFromPatch
    }
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
