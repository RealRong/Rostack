import {
  clone
} from '@whiteboard/core/mutation/common'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeRoutePoint,
  Group,
  GroupId,
  Node,
  NodeId
} from '@whiteboard/core/types'
import type {
  MindmapId,
  MindmapRecord
} from '@whiteboard/core/mindmap/types'
import {
  field,
  map,
  schema,
  sequence,
  object,
  singleton,
  tree,
} from '@shared/mutation'
import {
  applyEdgeLabelPatch,
  canvasRefKey,
  createMindmapTreeSnapshot,
  diffEdgeLabelPatch,
  getLabels,
  getManualRoutePoints,
  type WhiteboardMindmapTreeValue,
  writeEdgeLabels,
  writeEdgeRoute,
  writeMindmapTreeSnapshot,
} from './support'

export const whiteboardMutationSchema = schema<Document>()({
  document: singleton<Document, Document>()({
    id: field<Document['id']>(),
    name: field<Document['name']>(),
    background: field<Document['background']>(),
    order: sequence<CanvasItemRef>().using({
      read: (document) => (document as Document).order,
      write: (document, _key, items) => ({
        ...document as Document,
        order: items.map((item) => clone(item)!),
      }),
      identify: canvasRefKey,
      clone: (item: CanvasItemRef) => clone(item)!,
      emit: 'order',
    }),
  }).from({
        read: (document) => document,
        write: (_document, next) => next as Document,
  }).changes(({ field }) => ({
      value: [
        field('id'),
        field('name'),
      ],
      background: [field('background')],
    })),

  node: map<Document, NodeId, Node>()({
    type: field<Node['type']>(),
    position: field<Node['position']>(),
    size: field<Node['size']>(),
    rotation: field<Node['rotation']>(),
    groupId: field<Node['groupId']>(),
    owner: field<Node['owner']>(),
    locked: field<Node['locked']>(),
    data: object<Node['data']>(),
    style: object<Node['style']>(),
  }).from({
      read: (document) => document.nodes,
      write: (document, next) => ({
        ...document,
        nodes: next as Document['nodes'],
      }),
  }).changes(({ field, object }) => ({
      geometry: [
        field('position'),
        field('size'),
        field('rotation'),
      ],
      owner: [
        field('groupId'),
        field('owner'),
      ],
      content: [
        field('type'),
        field('locked'),
        object('data').deep(),
        object('style').deep(),
      ],
    })),

  edge: map<Document, EdgeId, Edge>()({
    source: field<Edge['source']>(),
    target: field<Edge['target']>(),
    type: field<Edge['type']>(),
    locked: field<Edge['locked']>(),
    groupId: field<Edge['groupId']>(),
    textMode: field<Edge['textMode']>(),
    route: sequence<EdgeRoutePoint>().using({
      read: (document, edgeId) => getManualRoutePoints((document as Document).edges[edgeId as EdgeId]!),
      write: (document, edgeId, items) => writeEdgeRoute(document as Document, edgeId as EdgeId, items),
      identify: (point) => point.id,
      clone: (point) => clone(point)!,
      emit: 'route',
    }),
    style: object<Edge['style']>(),
    labels: sequence<EdgeLabel>().using({
      read: (document, edgeId) => getLabels((document as Document).edges[edgeId as EdgeId]!),
      write: (document, edgeId, items) => writeEdgeLabels(document as Document, edgeId as EdgeId, items),
      identify: (label) => label.id,
      clone: (label) => clone(label)!,
      patch: (label, patch) => applyEdgeLabelPatch(label, patch as Parameters<typeof applyEdgeLabelPatch>[1]),
      diff: (before, after) => diffEdgeLabelPatch(before, after),
      emit: 'labels',
    }),
    data: object<Edge['data']>(),
  }).from({
      read: (document) => document.edges,
      write: (document, next) => ({
        ...document,
        edges: next as Document['edges'],
      }),
  }).changes(({ field, object }) => ({
      endpoints: [
        field('source'),
        field('target'),
        field('type'),
        field('locked'),
        field('groupId'),
        field('textMode'),
      ],
      style: [object('style').deep()],
      data: [object('data').deep()],
    })),

  mindmap: map<Document, MindmapId, MindmapRecord>()({
    root: field<MindmapRecord['root']>(),
    members: object<MindmapRecord['members']>(),
    children: object<MindmapRecord['children']>(),
    layout: object<MindmapRecord['layout']>(),
    structure: tree<WhiteboardMindmapTreeValue>().using({
      read: (document, mindmapId) => createMindmapTreeSnapshot((document as Document).mindmaps[mindmapId as MindmapId]!),
      write: (document, mindmapId, snapshot) => writeMindmapTreeSnapshot(
        document as Document,
        mindmapId as MindmapId,
        snapshot
      ),
      clone: (value) => clone(value)!,
      emit: 'structure',
    }),
  }).from({
      read: (document) => document.mindmaps,
      write: (document, next) => ({
        ...document,
        mindmaps: next as Document['mindmaps'],
      }),
  }).changes(({ field, object }) => ({
      layout: [object('layout').deep()],
    })),

  group: map<Document, GroupId, Group>()({
    locked: field<Group['locked']>(),
    name: field<Group['name']>(),
  }).from({
      read: (document) => document.groups,
      write: (document, next) => ({
        ...document,
        groups: next as Document['groups'],
      }),
  }).changes(({ field }) => ({
      value: [
        field('locked'),
        field('name'),
      ],
    })),
})
