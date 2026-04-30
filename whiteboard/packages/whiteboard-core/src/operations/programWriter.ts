import type {
  CanvasItemRef,
  Document,
  DocumentPatch,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeLabelAnchor,
  EdgeLabelPatch,
  EdgePatch,
  EdgeRoutePoint,
  EdgeRoutePointAnchor,
  Group,
  GroupId,
  GroupPatch,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  NodePatch,
} from '@whiteboard/core/types'
import type {
  MutationChangeInput,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationProgramWriter,
  MutationTreeSubtreeSnapshot,
} from '@shared/mutation'
import {
  CANVAS_ORDER_STRUCTURE,
  canvasRefKey,
  edgeLabelsStructure,
  edgeRoutePointsStructure,
  mindmapTreeStructure,
  toStructuralOrderedAnchor,
  type WhiteboardMindmapTreeValue,
} from '@whiteboard/core/operations/custom/structures'

type WhiteboardTag = string
type WhiteboardTags = readonly WhiteboardTag[] | undefined

export type WhiteboardRoutePointPatch = Partial<Omit<EdgeRoutePoint, 'id'>>

export interface WhiteboardProgramWriter {
  document: {
    create(value: Document, tags?: WhiteboardTags): void
    patch(patch: DocumentPatch, tags?: WhiteboardTags): void
  }
  canvas: {
    order: {
      move(
        ref: CanvasItemRef,
        to: MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      splice(
        refs: readonly CanvasItemRef[],
        to: MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      delete(
        ref: CanvasItemRef,
        tags?: WhiteboardTags
      ): void
    }
  }
  node: {
    create(value: Node, tags?: WhiteboardTags): void
    patch(id: NodeId, patch: NodePatch, tags?: WhiteboardTags): void
    delete(id: NodeId, tags?: WhiteboardTags): void
  }
  edge: {
    create(value: Edge, tags?: WhiteboardTags): void
    patch(id: EdgeId, patch: EdgePatch, tags?: WhiteboardTags): void
    delete(id: EdgeId, tags?: WhiteboardTags): void
    label: {
      insert(
        edgeId: EdgeId,
        label: EdgeLabel,
        to: EdgeLabelAnchor | MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      move(
        edgeId: EdgeId,
        labelId: string,
        to: EdgeLabelAnchor | MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      splice(
        edgeId: EdgeId,
        labelIds: readonly string[],
        to: EdgeLabelAnchor | MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      patch(
        edgeId: EdgeId,
        labelId: string,
        patch: EdgeLabelPatch,
        tags?: WhiteboardTags
      ): void
      delete(
        edgeId: EdgeId,
        labelId: string,
        tags?: WhiteboardTags
      ): void
    }
    route: {
      insert(
        edgeId: EdgeId,
        point: EdgeRoutePoint,
        to: EdgeRoutePointAnchor | MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      move(
        edgeId: EdgeId,
        pointId: string,
        to: EdgeRoutePointAnchor | MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      splice(
        edgeId: EdgeId,
        pointIds: readonly string[],
        to: EdgeRoutePointAnchor | MutationOrderedAnchor,
        tags?: WhiteboardTags
      ): void
      patch(
        edgeId: EdgeId,
        pointId: string,
        patch: WhiteboardRoutePointPatch,
        tags?: WhiteboardTags
      ): void
      delete(
        edgeId: EdgeId,
        pointId: string,
        tags?: WhiteboardTags
      ): void
    }
  }
  group: {
    create(value: Group, tags?: WhiteboardTags): void
    patch(id: GroupId, patch: GroupPatch, tags?: WhiteboardTags): void
    delete(id: GroupId, tags?: WhiteboardTags): void
  }
  mindmap: {
    create(value: MindmapRecord, tags?: WhiteboardTags): void
    patch(
      id: MindmapId,
      patch: Partial<Omit<MindmapRecord, 'id'>>,
      tags?: WhiteboardTags
    ): void
    delete(id: MindmapId, tags?: WhiteboardTags): void
    tree: {
      insert(input: {
        mindmapId: MindmapId
        nodeId: NodeId
        parentId?: NodeId
        index?: number
        value?: WhiteboardMindmapTreeValue
        tags?: WhiteboardTags
      }): void
      move(input: {
        mindmapId: MindmapId
        nodeId: NodeId
        parentId?: NodeId
        index?: number
        tags?: WhiteboardTags
      }): void
      delete(
        mindmapId: MindmapId,
        nodeId: NodeId,
        tags?: WhiteboardTags
      ): void
      restore(
        mindmapId: MindmapId,
        snapshot: MutationTreeSubtreeSnapshot<WhiteboardMindmapTreeValue>,
        tags?: WhiteboardTags
      ): void
      patch(
        mindmapId: MindmapId,
        nodeId: NodeId,
        patch: Partial<WhiteboardMindmapTreeValue>,
        tags?: WhiteboardTags
      ): void
    }
  }
  semantic: {
    tag(value: WhiteboardTag): void
    change(key: string, change?: MutationChangeInput): void
    footprint(footprint: readonly MutationFootprint[]): void
    mindmap: {
      layout(id: MindmapId): void
    }
  }
}

const toOrderedAnchor = (
  input: MutationOrderedAnchor | EdgeLabelAnchor | EdgeRoutePointAnchor
): MutationOrderedAnchor => (
  'kind' in input
  && (input.kind === 'before' || input.kind === 'after')
  && !('itemId' in input)
)
  ? toStructuralOrderedAnchor(input)
  : input as MutationOrderedAnchor

export const createWhiteboardProgramWriter = (
  writer: MutationProgramWriter<WhiteboardTag>
): WhiteboardProgramWriter => ({
  document: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'document',
        id: 'document'
      }, value, tags)
    },
    patch: (patch, tags) => {
      writer.entity.patch({
        table: 'document',
        id: 'document'
      }, patch, tags)
    }
  },
  canvas: {
    order: {
      move: (ref, to, tags) => {
        writer.structure.ordered.move(
          CANVAS_ORDER_STRUCTURE,
          canvasRefKey(ref),
          to,
          tags
        )
      },
      splice: (refs, to, tags) => {
        writer.structure.ordered.splice(
          CANVAS_ORDER_STRUCTURE,
          refs.map((ref) => canvasRefKey(ref)),
          to,
          tags
        )
      },
      delete: (ref, tags) => {
        writer.structure.ordered.delete(
          CANVAS_ORDER_STRUCTURE,
          canvasRefKey(ref),
          tags
        )
      }
    }
  },
  node: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'node',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'node',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'node',
        id
      }, tags)
    }
  },
  edge: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'edge',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'edge',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'edge',
        id
      }, tags)
    },
    label: {
      insert: (edgeId, label, to, tags) => {
        writer.structure.ordered.insert(
          edgeLabelsStructure(edgeId),
          label.id,
          label,
          toOrderedAnchor(to),
          tags
        )
      },
      move: (edgeId, labelId, to, tags) => {
        writer.structure.ordered.move(
          edgeLabelsStructure(edgeId),
          labelId,
          toOrderedAnchor(to),
          tags
        )
      },
      splice: (edgeId, labelIds, to, tags) => {
        writer.structure.ordered.splice(
          edgeLabelsStructure(edgeId),
          labelIds,
          toOrderedAnchor(to),
          tags
        )
      },
      patch: (edgeId, labelId, patch, tags) => {
        writer.structure.ordered.patch(
          edgeLabelsStructure(edgeId),
          labelId,
          patch,
          tags
        )
      },
      delete: (edgeId, labelId, tags) => {
        writer.structure.ordered.delete(
          edgeLabelsStructure(edgeId),
          labelId,
          tags
        )
      }
    },
    route: {
      insert: (edgeId, point, to, tags) => {
        writer.structure.ordered.insert(
          edgeRoutePointsStructure(edgeId),
          point.id,
          point,
          toOrderedAnchor(to),
          tags
        )
      },
      move: (edgeId, pointId, to, tags) => {
        writer.structure.ordered.move(
          edgeRoutePointsStructure(edgeId),
          pointId,
          toOrderedAnchor(to),
          tags
        )
      },
      splice: (edgeId, pointIds, to, tags) => {
        writer.structure.ordered.splice(
          edgeRoutePointsStructure(edgeId),
          pointIds,
          toOrderedAnchor(to),
          tags
        )
      },
      patch: (edgeId, pointId, patch, tags) => {
        writer.structure.ordered.patch(
          edgeRoutePointsStructure(edgeId),
          pointId,
          patch,
          tags
        )
      },
      delete: (edgeId, pointId, tags) => {
        writer.structure.ordered.delete(
          edgeRoutePointsStructure(edgeId),
          pointId,
          tags
        )
      }
    }
  },
  group: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'group',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'group',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'group',
        id
      }, tags)
    }
  },
  mindmap: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'mindmap',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'mindmap',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'mindmap',
        id
      }, tags)
    },
    tree: {
      insert: ({ mindmapId, nodeId, parentId, index, value, tags }) => {
        writer.structure.tree.insert(
          mindmapTreeStructure(mindmapId),
          nodeId,
          parentId,
          index,
          value,
          tags
        )
      },
      move: ({ mindmapId, nodeId, parentId, index, tags }) => {
        writer.structure.tree.move(
          mindmapTreeStructure(mindmapId),
          nodeId,
          parentId,
          index,
          tags
        )
      },
      delete: (mindmapId, nodeId, tags) => {
        writer.structure.tree.delete(
          mindmapTreeStructure(mindmapId),
          nodeId,
          tags
        )
      },
      restore: (mindmapId, snapshot, tags) => {
        writer.structure.tree.restore(
          mindmapTreeStructure(mindmapId),
          snapshot,
          tags
        )
      },
      patch: (mindmapId, nodeId, patch, tags) => {
        writer.structure.tree.patch(
          mindmapTreeStructure(mindmapId),
          nodeId,
          patch,
          tags
        )
      }
    }
  },
  semantic: {
    tag: writer.semantic.tag,
    change: writer.semantic.change,
    footprint: writer.semantic.footprint,
    mindmap: {
      layout: (id) => {
        writer.semantic.change('mindmap.layout', [id])
      }
    }
  }
})
