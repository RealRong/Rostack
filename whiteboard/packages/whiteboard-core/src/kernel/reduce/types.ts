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
  Group,
  GroupField,
  GroupId,
  Invalidation,
  KernelReduceResult,
  MindmapBranchField,
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
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
  Point
} from '@whiteboard/core/types'
import type { ReduceRuntime } from '@whiteboard/core/kernel/reduce/runtime'

export type OrderedAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; itemId: string }
  | { kind: 'after'; itemId: string }

export type ReducerShortCircuit = KernelReduceResult | undefined

export type ReducerReadApi = {
  document: {
    get(): Document
    background(): Document['background']
  }
  canvas: {
    order(): readonly CanvasItemRef[]
  }
  node: {
    get(id: NodeId): Node | undefined
    require(id: NodeId): Node
    isTopLevel(id: NodeId): boolean
    record(id: NodeId, scope: NodeRecordScope): unknown
  }
  edge: {
    get(id: EdgeId): Edge | undefined
    require(id: EdgeId): Edge
    record(id: EdgeId, scope: EdgeRecordScope): unknown
  }
  group: {
    get(id: GroupId): Group | undefined
    require(id: GroupId): Group
  }
  mindmap: {
    get(id: MindmapId): MindmapRecord | undefined
    require(id: MindmapId): MindmapRecord
    tree(id: MindmapId | NodeId): import('@whiteboard/core/types').MindmapTree | undefined
    topicRecord(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope): unknown
  }
  record: {
    path(root: unknown, path: string): unknown
  }
}

export type ReducerTx = {
  _runtime: ReduceRuntime
  read: ReducerReadApi
  document: {
    lifecycle: {
      replace(document: Document): void
    }
    background: {
      set(background: Document['background']): void
    }
  }
  node: {
    lifecycle: {
      create(node: Node): void
      restore(node: Node, slot?: import('@whiteboard/core/types').CanvasSlot): void
      delete(id: NodeId): void
    }
    field: {
      set<Field extends NodeField>(id: NodeId, field: Field, value: Node[Field]): void
      unset(id: NodeId, field: NodeUnsetField): void
    }
    record: {
      set(id: NodeId, scope: NodeRecordScope, path: string, value: unknown): void
      unset(id: NodeId, scope: NodeRecordScope, path: string): void
    }
  }
  edge: {
    lifecycle: {
      create(edge: Edge): void
      restore(edge: Edge, slot?: import('@whiteboard/core/types').CanvasSlot): void
      delete(id: EdgeId): void
    }
    field: {
      set<Field extends EdgeField>(id: EdgeId, field: Field, value: Edge[Field]): void
      unset(id: EdgeId, field: import('@whiteboard/core/types').EdgeUnsetField): void
    }
    record: {
      set(id: EdgeId, scope: EdgeRecordScope, path: string, value: unknown): void
      unset(id: EdgeId, scope: EdgeRecordScope, path: string): void
    }
  }
  group: {
    lifecycle: {
      create(group: Group): void
      restore(group: Group): void
      delete(id: GroupId): void
    }
    field: {
      set<Field extends GroupField>(id: GroupId, field: Field, value: Group[Field]): void
      unset(id: GroupId, field: GroupField): void
    }
  }
  collection: {
    canvas: {
      order(): {
        read: {
          list(): readonly CanvasItemRef[]
          has(itemId: string): boolean
          get(itemId: string): CanvasItemRef | undefined
        }
        structure: {
          insert(item: CanvasItemRef, anchor: OrderedAnchor): void
          delete(itemId: string): void
          move(itemId: string, anchor: OrderedAnchor): void
          moveMany(refs: readonly CanvasItemRef[], anchor: {
            kind: 'front' | 'back' | 'before' | 'after'
            ref?: CanvasItemRef
          }): void
        }
      }
    }
    edge: {
      labels(edgeId: EdgeId): {
        read: {
          list(): readonly EdgeLabel[]
          has(itemId: string): boolean
          get(itemId: string): EdgeLabel | undefined
        }
        structure: {
          insert(item: EdgeLabel, anchor: OrderedAnchor): void
          delete(itemId: string): void
          move(itemId: string, anchor: OrderedAnchor): void
        }
        field: {
          set(labelId: string, field: EdgeLabelField, value: unknown): void
          unset(labelId: string, field: EdgeLabelField): void
        }
        record: {
          set(labelId: string, scope: EdgeLabelRecordScope, path: string, value: unknown): void
          unset(labelId: string, scope: EdgeLabelRecordScope, path: string): void
        }
      }
      routePoints(edgeId: EdgeId): {
        read: {
          list(): readonly EdgeRoutePoint[]
          has(itemId: string): boolean
          get(itemId: string): EdgeRoutePoint | undefined
        }
        structure: {
          insert(item: EdgeRoutePoint, anchor: OrderedAnchor): void
          delete(itemId: string): void
          move(itemId: string, anchor: OrderedAnchor): void
        }
        field: {
          set(pointId: string, field: EdgeRoutePointField, value: number): void
        }
      }
    }
    mindmap: {
      children(mindmapId: MindmapId, parentId: NodeId): {
        read: {
          list(): readonly NodeId[]
          has(itemId: string): boolean
          get(itemId: string): NodeId | undefined
        }
        structure: {
          insert(item: NodeId, anchor: OrderedAnchor): void
          delete(itemId: string): void
          move(itemId: string, anchor: OrderedAnchor): void
        }
      }
    }
  }
  snapshot: {
    node: {
      capture(id: NodeId): Node
    }
    edge: {
      capture(id: EdgeId): Edge
    }
    group: {
      capture(id: GroupId): Group
    }
    mindmap: {
      capture(id: MindmapId): import('@whiteboard/core/types').MindmapSnapshot
      topic(id: MindmapId, rootId: NodeId): MindmapTopicSnapshot
    }
    canvas: {
      slot(ref: CanvasItemRef): import('@whiteboard/core/types').CanvasSlot | undefined
    }
  }
  dirty: {
    document: {
      touch(): void
      background(): void
    }
    canvas: {
      order(): void
    }
    node: {
      touch(id: NodeId): void
    }
    edge: {
      touch(id: EdgeId): void
    }
    group: {
      touch(id: GroupId): void
    }
    mindmap: {
      layout(id: MindmapId): void
      touch(id: MindmapId): void
    }
  }
  reconcile: {
    mindmap: {
      layout(id: MindmapId): void
    }
    run(): import('@whiteboard/core/types').Result<void, import('@whiteboard/core/types').ResultCode>
  }
  mindmap: {
    structure: {
      create(input: { mindmap: MindmapRecord; nodes: readonly Node[] }): void
      restore(snapshot: { mindmap: MindmapRecord; nodes: readonly Node[]; slot?: import('@whiteboard/core/types').CanvasSlot }): void
      delete(id: MindmapId): void
    }
    root: {
      move(id: MindmapId, position: Point): void
    }
    layout: {
      patch(id: MindmapId, patch: Partial<MindmapLayoutSpec>): void
    }
    topic: {
      structure: {
        insert(input: { id: MindmapId; topic: Node; value: MindmapTopicInsertInput }): void
        restore(input: { id: MindmapId; snapshot: MindmapTopicSnapshot }): void
        move(input: { id: MindmapId; value: MindmapTopicMoveInput }): void
        delete(input: { id: MindmapId; nodeId: NodeId }): void
      }
      field: {
        set<Field extends MindmapTopicField>(id: MindmapId, topicId: NodeId, field: Field, value: Node[Field]): void
        unset(id: MindmapId, topicId: NodeId, field: MindmapTopicUnsetField): void
      }
      record: {
        set(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope, path: string, value: unknown): void
        unset(id: MindmapId, topicId: NodeId, scope: MindmapTopicRecordScope, path: string): void
      }
      collapse: {
        set(id: MindmapId, topicId: NodeId, collapsed?: boolean): void
      }
    }
    branch: {
      field: {
        set<Field extends MindmapBranchField>(id: MindmapId, topicId: NodeId, field: Field, value: unknown): void
        unset(id: MindmapId, topicId: NodeId, field: MindmapBranchField): void
      }
    }
  }
  inverse: {
    prepend(op: Operation): void
    prependMany(ops: readonly Operation[]): void
    append(op: Operation): void
    appendMany(ops: readonly Operation[]): void
    finish(): readonly Operation[]
  }
  commit: {
    result(): KernelReduceResult
  }
}
