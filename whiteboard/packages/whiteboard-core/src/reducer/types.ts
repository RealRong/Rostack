import type { ReducerResult } from '@shared/reducer'
import type { RecordWrite } from '@shared/draft'
import type { HistoryFootprint } from '@whiteboard/core/operations/history'
import type {
  CanvasItemRef,
  ChangeSet,
  Document,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeLabelFieldPatch,
  EdgeFieldPatch,
  EdgeRoutePoint,
  Group,
  GroupField,
  GroupId,
  Invalidation,
  KernelReadImpact,
  MindmapBranchFieldPatch,
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapSnapshot,
  MindmapTopicFieldPatch,
  MindmapTopicInsertInput,
  MindmapTopicMoveInput,
  MindmapTopicSnapshot,
  Node,
  NodeFieldPatch,
  NodeId,
  Operation,
  Origin,
  Point,
  ResultCode
} from '@whiteboard/core/types'

export type WhiteboardReduceIssueCode = ResultCode

export type WhiteboardReduceExtra = {
  changes: ChangeSet
  invalidation: Invalidation
  impact: KernelReadImpact
}

export type OrderedAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; itemId: string }
  | { kind: 'after'; itemId: string }

export type CanvasOrderMoveTo = Extract<
  Operation,
  { type: 'canvas.order.move' }
>['to']

export type WhiteboardReduceHistoryApi = {
  add(key: HistoryFootprint[number]): void
  addMany(keys: readonly HistoryFootprint[number][]): void
}

export interface WhiteboardReduceCtx {
  readonly origin: Origin

  readonly document: {
    replace(document: Document): void
    setBackground(background: Document['background']): void
  }

  readonly canvas: {
    move(refs: readonly CanvasItemRef[], to: CanvasOrderMoveTo): void
  }

  readonly node: {
    create(node: Node): void
    restore(node: Node, slot?: import('@whiteboard/core/types').CanvasSlot): void
    patch(id: NodeId, input: {
      fields?: NodeFieldPatch
      record?: RecordWrite
    }): void
    delete(id: NodeId): void
  }

  readonly edge: {
    create(edge: Edge): void
    restore(edge: Edge, slot?: import('@whiteboard/core/types').CanvasSlot): void
    patch(id: EdgeId, input: {
      fields?: EdgeFieldPatch
      record?: RecordWrite
    }): void
    insertLabel(edgeId: EdgeId, label: EdgeLabel, to: OrderedAnchor): void
    deleteLabel(edgeId: EdgeId, labelId: string): void
    moveLabel(edgeId: EdgeId, labelId: string, to: OrderedAnchor): void
    patchLabel(edgeId: EdgeId, labelId: string, input: {
      fields?: EdgeLabelFieldPatch
      record?: RecordWrite
    }): void
    insertRoutePoint(edgeId: EdgeId, point: EdgeRoutePoint, to: OrderedAnchor): void
    deleteRoutePoint(edgeId: EdgeId, pointId: string): void
    moveRoutePoint(edgeId: EdgeId, pointId: string, to: OrderedAnchor): void
    patchRoutePoint(edgeId: EdgeId, pointId: string, fields: Partial<Record<'x' | 'y', number>>): void
    delete(id: EdgeId): void
  }

  readonly group: {
    create(group: Group): void
    restore(group: Group): void
    patch(id: GroupId, fields?: Partial<Record<GroupField, Group[GroupField] | undefined>>): void
    delete(id: GroupId): void
  }

  readonly mindmap: {
    create(input: { mindmap: MindmapRecord; nodes: readonly Node[] }): void
    restore(snapshot: MindmapSnapshot): void
    delete(id: MindmapId): void
    moveRoot(id: MindmapId, position: Point): void
    patchLayout(id: MindmapId, patch: Partial<MindmapLayoutSpec>): void
    insertTopic(input: { id: MindmapId; topic: Node; value: MindmapTopicInsertInput }): void
    restoreTopic(input: { id: MindmapId; snapshot: MindmapTopicSnapshot }): void
    moveTopic(input: { id: MindmapId; value: MindmapTopicMoveInput }): void
    deleteTopic(input: { id: MindmapId; nodeId: NodeId }): void
    patchTopic(id: MindmapId, topicId: NodeId, input: {
      fields?: MindmapTopicFieldPatch
      record?: RecordWrite
    }): void
    patchBranch(id: MindmapId, topicId: NodeId, fields?: MindmapBranchFieldPatch): void
    setTopicCollapsed(id: MindmapId, topicId: NodeId, collapsed?: boolean): void
    flush(): void
  }

  readonly history: WhiteboardReduceHistoryApi

  fail(code: WhiteboardReduceIssueCode, message: string, details?: unknown): never
}

export type WhiteboardReduceResult = ReducerResult<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra,
  WhiteboardReduceIssueCode
>
