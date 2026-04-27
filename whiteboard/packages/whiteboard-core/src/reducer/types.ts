import type { ReducerResult } from '@shared/reducer'
import type { Path } from '@shared/mutation'
import type { HistoryFootprint } from '@whiteboard/core/operations/history'
import type {
  CanvasItemRef,
  ChangeSet,
  Document,
  Edge,
  EdgeField,
  EdgeId,
  EdgeLabel,
  EdgeLabelField,
  EdgeLabelRecordScope,
  EdgeRecordScope,
  EdgeRoutePoint,
  EdgeRoutePointField,
  EdgeUnsetField,
  Group,
  GroupField,
  GroupId,
  Invalidation,
  KernelReadImpact,
  MindmapBranchField,
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapSnapshot,
  MindmapTopicField,
  MindmapTopicInsertInput,
  MindmapTopicMoveInput,
  MindmapTopicRecordScope,
  MindmapTopicSnapshot,
  MindmapTopicUnsetField,
  Node,
  NodeField,
  NodeId,
  NodeRecordScope,
  NodeUnsetField,
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
    setField<Field extends NodeField>(id: NodeId, field: Field, value: Node[Field]): void
    unsetField(id: NodeId, field: NodeUnsetField): void
    setRecord(id: NodeId, scope: NodeRecordScope, path: Path, value: unknown): void
    unsetRecord(id: NodeId, scope: NodeRecordScope, path: Path): void
    delete(id: NodeId): void
  }

  readonly edge: {
    create(edge: Edge): void
    restore(edge: Edge, slot?: import('@whiteboard/core/types').CanvasSlot): void
    setField<Field extends EdgeField>(id: EdgeId, field: Field, value: Edge[Field]): void
    unsetField(id: EdgeId, field: EdgeUnsetField): void
    setRecord(id: EdgeId, scope: EdgeRecordScope, path: Path, value: unknown): void
    unsetRecord(id: EdgeId, scope: EdgeRecordScope, path: Path): void
    insertLabel(edgeId: EdgeId, label: EdgeLabel, to: OrderedAnchor): void
    deleteLabel(edgeId: EdgeId, labelId: string): void
    moveLabel(edgeId: EdgeId, labelId: string, to: OrderedAnchor): void
    setLabelField(edgeId: EdgeId, labelId: string, field: EdgeLabelField, value: unknown): void
    unsetLabelField(edgeId: EdgeId, labelId: string, field: EdgeLabelField): void
    setLabelRecord(edgeId: EdgeId, labelId: string, scope: EdgeLabelRecordScope, path: Path, value: unknown): void
    unsetLabelRecord(edgeId: EdgeId, labelId: string, scope: EdgeLabelRecordScope, path: Path): void
    insertRoutePoint(edgeId: EdgeId, point: EdgeRoutePoint, to: OrderedAnchor): void
    deleteRoutePoint(edgeId: EdgeId, pointId: string): void
    moveRoutePoint(edgeId: EdgeId, pointId: string, to: OrderedAnchor): void
    setRoutePointField(edgeId: EdgeId, pointId: string, field: EdgeRoutePointField, value: number): void
    delete(id: EdgeId): void
  }

  readonly group: {
    create(group: Group): void
    restore(group: Group): void
    setField<Field extends GroupField>(id: GroupId, field: Field, value: Group[Field]): void
    unsetField(id: GroupId, field: GroupField): void
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
    setTopicField<Field extends MindmapTopicField>(id: MindmapId, topicId: NodeId, field: Field, value: Node[Field]): void
    unsetTopicField(id: MindmapId, topicId: NodeId, field: MindmapTopicUnsetField): void
    setTopicRecord(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope, path: Path, value: unknown): void
    unsetTopicRecord(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope, path: Path): void
    setBranchField<Field extends MindmapBranchField>(id: MindmapId, topicId: NodeId, field: Field, value: MindmapRecord['members'][string]['branchStyle'][Field]): void
    unsetBranchField(id: MindmapId, topicId: NodeId, field: MindmapBranchField): void
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
