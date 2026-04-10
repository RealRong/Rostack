import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type {
  CanvasNode,
  EdgeItem
} from '@engine-types/projection'
import type { ReadStore } from '@shared/store'
import type { Edge, EdgeId, NodeId, Point } from '@whiteboard/core/types'
import {
  collectRelatedEdgeIds,
  createEdgeRelations,
  resolveEdgeEnds,
  type EdgeRelations
} from '@whiteboard/core/edge'
import {
  isSamePointArray,
  isSameRectWithRotationTuple
} from '@whiteboard/core/utils'
import { createValueStore } from '@shared/store'
import type { ReadSnapshot } from '@engine-types/internal/read'
import { createTrackedRead } from './tracked'

type EdgeCacheEntry = {
  sourceNodeRef?: CanvasNode
  targetNodeRef?: CanvasNode
  sourceGeometry?: NodeGeometryTuple
  targetGeometry?: NodeGeometryTuple
  structure: EdgeStructureTuple
  entry: EdgeItem
}

type EdgeCacheState = {
  relations: EdgeRelations
  cacheById: Map<EdgeId, EdgeCacheEntry>
  ids: EdgeId[]
  byId: Map<EdgeId, EdgeItem>
}

type EdgeProjectionUpdate = {
  nextState: EdgeCacheState
  idsChanged: boolean
  changedEdgeIds: Set<EdgeId>
}

type NodeGeometryTuple = {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

type EdgeStructureTuple = {
  type: string
  sourceKind: Edge['source']['kind']
  targetKind: Edge['target']['kind']
  groupId?: string
  sourceNodeId?: NodeId
  targetNodeId?: NodeId
  sourcePoint?: Point
  targetPoint?: Point
  sourceAnchorSide?: string
  sourceAnchorOffset?: number
  targetAnchorSide?: string
  targetAnchorOffset?: number
  textMode?: Edge['textMode']
  styleRef?: Edge['style']
  labelsRef?: Edge['labels']
  dataRef?: Edge['data']
  routePointsRef?: readonly { x: number; y: number }[]
}

type EdgeCacheMaterial = {
  sourceNodeRef?: CanvasNode
  targetNodeRef?: CanvasNode
  sourceGeometry?: NodeGeometryTuple
  targetGeometry?: NodeGeometryTuple
  structure: EdgeStructureTuple
}

const EDGE_STRUCTURE_SCALAR_KEYS = [
  'type',
  'sourceKind',
  'targetKind',
  'groupId',
  'sourceNodeId',
  'targetNodeId',
  'sourcePoint',
  'targetPoint',
  'sourceAnchorSide',
  'sourceAnchorOffset',
  'targetAnchorSide',
  'targetAnchorOffset',
  'textMode',
  'styleRef',
  'labelsRef',
  'dataRef'
] as const satisfies readonly (Exclude<keyof EdgeStructureTuple, 'routePointsRef'>)[]

const emptyRelations = (): EdgeRelations => ({
  edgeById: new Map<EdgeId, Edge>(),
  edgeIds: [],
  nodeToEdgeIds: new Map<NodeId, Set<EdgeId>>()
})

const emptyState = (): EdgeCacheState => ({
  relations: emptyRelations(),
  cacheById: new Map<EdgeId, EdgeCacheEntry>(),
  ids: [],
  byId: new Map<EdgeId, EdgeItem>()
})

const readNodeRotation = (
  node: CanvasNode['node']
) => (typeof node.rotation === 'number' ? node.rotation : 0)

const isSameView = (
  prevIds: readonly EdgeId[],
  prevById: ReadonlyMap<EdgeId, EdgeItem>,
  nextIds: readonly EdgeId[],
  nextById: ReadonlyMap<EdgeId, EdgeItem>
) => {
  if (prevIds.length !== nextIds.length) return false
  for (let index = 0; index < prevIds.length; index += 1) {
    const edgeId = prevIds[index]
    if (edgeId !== nextIds[index]) return false
    if (prevById.get(edgeId) !== nextById.get(edgeId)) return false
  }
  return true
}

const buildView = ({
  relations,
  cacheById,
  prevIds,
  prevById
}: {
  relations: EdgeRelations
  cacheById: ReadonlyMap<EdgeId, EdgeCacheEntry>
  prevIds: readonly EdgeId[]
  prevById: ReadonlyMap<EdgeId, EdgeItem>
}) => {
  const nextIds: EdgeId[] = []
  const nextById = new Map<EdgeId, EdgeItem>()

  relations.edgeIds.forEach((edgeId) => {
    const entry = cacheById.get(edgeId)?.entry
    if (!entry) return
    nextIds.push(edgeId)
    nextById.set(edgeId, entry)
  })

  const idsChanged = !isSameView(prevIds, prevById, nextIds, nextById)

  return {
    ids: idsChanged ? nextIds : prevIds as EdgeId[],
    byId: idsChanged ? nextById : prevById as Map<EdgeId, EdgeItem>,
    idsChanged
  }
}

const toNodeGeometryTuple = (entry: CanvasNode): NodeGeometryTuple => ({
  x: entry.geometry.rect.x,
  y: entry.geometry.rect.y,
  width: entry.geometry.rect.width,
  height: entry.geometry.rect.height,
  rotation: readNodeRotation(entry.node)
})

const toEdgeStructureTuple = (edge: EdgeItem['edge']): EdgeStructureTuple => ({
  type: edge.type,
  sourceKind: edge.source.kind,
  targetKind: edge.target.kind,
  groupId: edge.groupId,
  sourceNodeId: edge.source.kind === 'node' ? edge.source.nodeId : undefined,
  targetNodeId: edge.target.kind === 'node' ? edge.target.nodeId : undefined,
  sourcePoint: edge.source.kind === 'point' ? edge.source.point : undefined,
  targetPoint: edge.target.kind === 'point' ? edge.target.point : undefined,
  sourceAnchorSide: edge.source.kind === 'node' ? edge.source.anchor?.side : undefined,
  sourceAnchorOffset: edge.source.kind === 'node' ? edge.source.anchor?.offset : undefined,
  targetAnchorSide: edge.target.kind === 'node' ? edge.target.anchor?.side : undefined,
  targetAnchorOffset: edge.target.kind === 'node' ? edge.target.anchor?.offset : undefined,
  textMode: edge.textMode,
  styleRef: edge.style,
  labelsRef: edge.labels,
  dataRef: edge.data,
  routePointsRef: edge.route?.kind === 'manual'
    ? edge.route.points
    : undefined
})

const isSameEdgeStructureTuple = (
  left: EdgeStructureTuple,
  right: EdgeStructureTuple
) => {
  for (const key of EDGE_STRUCTURE_SCALAR_KEYS) {
    if (key === 'sourcePoint' || key === 'targetPoint') {
      const leftPoint = left[key]
      const rightPoint = right[key]
      if (
        leftPoint?.x !== rightPoint?.x
        || leftPoint?.y !== rightPoint?.y
      ) {
        return false
      }
      continue
    }

    if (left[key] !== right[key]) return false
  }
  return isSamePointArray(left.routePointsRef, right.routePointsRef)
}

const resolveEdgeRebuild = (impact: KernelReadImpact): 'none' | 'dirty' | 'full' => {
  if (impact.reset || impact.node.list || impact.edge.list) {
    return 'full'
  }

  const hasDirtyIds =
    impact.edge.ids.length > 0
    || impact.edge.nodeIds.length > 0

  if (hasDirtyIds) {
    return 'dirty'
  }

  if (impact.node.geometry || impact.node.value || impact.edge.geometry || impact.edge.value) {
    return 'full'
  }

  return 'none'
}

export const createEdgeProjection = (initialSnapshot: ReadSnapshot) => {
  const getNodeRect = (snapshot: ReadSnapshot) => snapshot.index.node.get
  const readModel = (snapshot: ReadSnapshot) => snapshot.model
  const list = createValueStore<readonly EdgeId[]>([])
  const tracked = createTrackedRead<EdgeId, EdgeItem | undefined>({
    emptyValue: undefined,
    read: (edgeId) => {
      ensureSynced()
      return state.byId.get(edgeId)
    }
  })
  let state: EdgeCacheState = emptyState()
  let snapshotRef: ReadSnapshot = initialSnapshot
  let visibleEdgesRef: ReadSnapshot['model']['edges']['visible'] | undefined

  const toEdgeCacheMaterial = (
    edge: EdgeItem['edge']
  ): EdgeCacheMaterial | undefined => {
    const sourceNodeRef =
      edge.source.kind === 'node'
        ? getNodeRect(snapshotRef)(edge.source.nodeId)
        : undefined
    const targetNodeRef =
      edge.target.kind === 'node'
        ? getNodeRect(snapshotRef)(edge.target.nodeId)
        : undefined
    if (edge.source.kind === 'node' && !sourceNodeRef) return undefined
    if (edge.target.kind === 'node' && !targetNodeRef) return undefined

    return {
      sourceNodeRef,
      targetNodeRef,
      sourceGeometry: sourceNodeRef ? toNodeGeometryTuple(sourceNodeRef) : undefined,
      targetGeometry: targetNodeRef ? toNodeGeometryTuple(targetNodeRef) : undefined,
      structure: toEdgeStructureTuple(edge)
    }
  }

  const reuseCacheEntryByData = (
    edge: EdgeItem['edge'],
    material: EdgeCacheMaterial,
    previous?: EdgeCacheEntry
  ): EdgeCacheEntry | undefined => {
    if (!previous) return undefined

    const isSameGeometry = (
      previous.sourceNodeRef === material.sourceNodeRef
      && previous.targetNodeRef === material.targetNodeRef
    ) || (
        (
          previous.sourceGeometry === undefined
          ? material.sourceGeometry === undefined
          : material.sourceGeometry !== undefined
            && isSameRectWithRotationTuple(previous.sourceGeometry, material.sourceGeometry)
        )
        && (
          previous.targetGeometry === undefined
          ? material.targetGeometry === undefined
          : material.targetGeometry !== undefined
            && isSameRectWithRotationTuple(previous.targetGeometry, material.targetGeometry)
        )
      )
    if (!isSameGeometry) return undefined

    if (!isSameEdgeStructureTuple(previous.structure, material.structure)) {
      return undefined
    }

    if (
      previous.entry.edge === edge
      && previous.sourceNodeRef === material.sourceNodeRef
      && previous.targetNodeRef === material.targetNodeRef
    ) {
      return previous
    }

    const nextEntry: EdgeItem = {
      id: edge.id,
      edge,
      ends: previous.entry.ends
    }
    return {
      sourceNodeRef: material.sourceNodeRef,
      targetNodeRef: material.targetNodeRef,
      sourceGeometry: material.sourceGeometry,
      targetGeometry: material.targetGeometry,
      structure: material.structure,
      entry: nextEntry
    }
  }

  const buildCacheEntry = (
    edge: EdgeItem['edge'],
    material: EdgeCacheMaterial
  ): EdgeCacheEntry | undefined => {
    const sourceNodeRef = material.sourceNodeRef
    const targetNodeRef = material.targetNodeRef
    const ends = resolveEdgeEnds({
      edge,
      source: sourceNodeRef,
      target: targetNodeRef
    })
    if (!ends) return undefined

    return {
      sourceNodeRef,
      targetNodeRef,
      sourceGeometry: material.sourceGeometry,
      targetGeometry: material.targetGeometry,
      structure: material.structure,
      entry: {
        id: edge.id,
        edge,
        ends
      }
    }
  }

  const commitState = (nextState: EdgeCacheState) => {
    state = nextState
  }

  const reconcileEdges = (
    current: EdgeCacheState,
    edgeIds: ReadonlySet<EdgeId>
  ): EdgeProjectionUpdate => {
    const previous = current.cacheById
    const nextCacheById = new Map(previous)
    const changedEdgeIds = new Set<EdgeId>()

    edgeIds.forEach((edgeId) => {
      const edge = current.relations.edgeById.get(edgeId)
      if (!edge) {
        nextCacheById.delete(edgeId)
        changedEdgeIds.add(edgeId)
        return
      }

      const material = toEdgeCacheMaterial(edge)
      if (!material) {
        nextCacheById.delete(edgeId)
        changedEdgeIds.add(edgeId)
        return
      }

      const previousEntry = previous.get(edgeId)
      const reused = reuseCacheEntryByData(edge, material, previousEntry)
      if (reused) {
        nextCacheById.set(edgeId, reused)
        if (reused !== previousEntry) {
          changedEdgeIds.add(edgeId)
        }
        return
      }

      const nextEntry = buildCacheEntry(edge, material)
      if (nextEntry) {
        nextCacheById.set(edgeId, nextEntry)
      } else {
        nextCacheById.delete(edgeId)
      }
      if (nextEntry !== previousEntry) {
        changedEdgeIds.add(edgeId)
      }
    })

    const nextView = buildView({
      relations: current.relations,
      cacheById: nextCacheById,
      prevIds: current.ids,
      prevById: current.byId
    })

    return {
      nextState: {
        relations: current.relations,
        cacheById: nextCacheById,
        ids: nextView.ids,
        byId: nextView.byId
      },
      idsChanged: nextView.idsChanged,
      changedEdgeIds
    }
  }

  const reconcileAll = (
    current: EdgeCacheState,
    edges: readonly Edge[]
  ): EdgeProjectionUpdate => {
    const relations = createEdgeRelations(edges)
    const changedEdgeIds = new Set<EdgeId>()

    const nextCacheById = new Map<EdgeId, EdgeCacheEntry>()
    relations.edgeIds.forEach((edgeId) => {
      const edge = relations.edgeById.get(edgeId)
      if (!edge) return

      const material = toEdgeCacheMaterial(edge)
      if (!material) return

      const previousEntry = current.cacheById.get(edgeId)
      const reused = reuseCacheEntryByData(edge, material, previousEntry)
      if (reused) {
        nextCacheById.set(edgeId, reused)
        if (reused !== previousEntry) {
          changedEdgeIds.add(edgeId)
        }
        return
      }

      const nextEntry = buildCacheEntry(edge, material)
      if (nextEntry) {
        nextCacheById.set(edgeId, nextEntry)
      }
      if (nextEntry !== previousEntry) {
        changedEdgeIds.add(edgeId)
      }
    })

    current.ids.forEach((edgeId) => {
      if (!nextCacheById.has(edgeId)) {
        changedEdgeIds.add(edgeId)
      }
    })

    const nextView = buildView({
      relations,
      cacheById: nextCacheById,
      prevIds: current.ids,
      prevById: current.byId
    })

    return {
      nextState: {
        relations,
        cacheById: nextCacheById,
        ids: nextView.ids,
        byId: nextView.byId
      },
      idsChanged: nextView.idsChanged,
      changedEdgeIds
    }
  }

  const ensureSynced = () => {
    if (visibleEdgesRef !== readModel(snapshotRef).edges.visible) {
      const visibleEdges = readModel(snapshotRef).edges.visible
      const next = reconcileAll(state, visibleEdges)
      commitState(next.nextState)
      visibleEdgesRef = visibleEdges
    }
  }

  const initialVisibleEdges = readModel(snapshotRef).edges.visible
  const initial = reconcileAll(state, initialVisibleEdges)
  commitState(initial.nextState)
  visibleEdgesRef = initialVisibleEdges
  list.set(state.ids)

  const applyChange = (impact: KernelReadImpact, snapshot: ReadSnapshot) => {
    snapshotRef = snapshot
    const rebuild = resolveEdgeRebuild(impact)
    if (rebuild === 'none') return

    const visibleEdges = readModel(snapshotRef).edges.visible
    const visibleEdgesChanged = visibleEdges !== visibleEdgesRef
    let idsChanged = false
    let changedEdgeIds = new Set<EdgeId>()

    if (rebuild === 'full' || visibleEdgesChanged) {
      const next = reconcileAll(state, visibleEdges)
      commitState(next.nextState)
      visibleEdgesRef = visibleEdges
      idsChanged = next.idsChanged
      changedEdgeIds = next.changedEdgeIds
    } else {
      const affectedEdgeIds = new Set<EdgeId>()
      if (impact.edge.nodeIds.length) {
        const fromNodes = collectRelatedEdgeIds(
          state.relations.nodeToEdgeIds,
          new Set(impact.edge.nodeIds)
        )
        fromNodes.forEach((edgeId) => {
          affectedEdgeIds.add(edgeId)
        })
      }
      impact.edge.ids.forEach((edgeId) => {
        affectedEdgeIds.add(edgeId)
      })
      const next = reconcileEdges(state, affectedEdgeIds)
      commitState(next.nextState)
      idsChanged = next.idsChanged
      changedEdgeIds = next.changedEdgeIds
    }

    if (idsChanged) {
      list.set(state.ids)
    }

    tracked.sync(changedEdgeIds)
  }

  const related = (nodeIds: Iterable<NodeId>) => {
    ensureSynced()
    return Array.from(collectRelatedEdgeIds(state.relations.nodeToEdgeIds, nodeIds))
  }

  return {
    list: list as ReadStore<readonly EdgeId[]>,
    related,
    item: tracked.item,
    applyChange
  }
}
