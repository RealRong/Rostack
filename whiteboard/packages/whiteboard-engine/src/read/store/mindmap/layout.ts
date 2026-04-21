import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import { node as nodeApi } from '@whiteboard/core/node'
import type { Invalidation, MindmapId } from '@whiteboard/core/types'
import { createProjectionRuntime } from '@whiteboard/engine/read/store/projection'
import type { ReadSnapshot } from '@whiteboard/engine/types/internal/read'
import type { BoardConfig } from '@whiteboard/engine/types/instance'
import type {
  MindmapLayoutItem,
  MindmapStructureItem
} from '@whiteboard/engine/types/projection'
import { store } from '@shared/core'

type MindmapLayoutProjectionState = {
  entryById: Map<MindmapId, MindmapLayoutItem>
  ids: readonly MindmapId[]
  nodesRef?: ReadSnapshot['document']['nodes']
  mindmapsRef?: ReadSnapshot['document']['mindmaps']
}

type MindmapLayoutProjectionUpdate = {
  nextState: MindmapLayoutProjectionState
  idsChanged: boolean
  changedIds: Set<MindmapId>
}

const isSameIds = (left: readonly MindmapId[], right: readonly MindmapId[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export const createMindmapLayoutProjection = (
  initialSnapshot: ReadSnapshot,
  deps: {
    config: BoardConfig
    list: store.ReadStore<readonly MindmapId[]>
    structure: store.KeyedReadStore<MindmapId, MindmapStructureItem | undefined>
  }
) => {
  const { config, structure } = deps
  const projection = createProjectionRuntime<MindmapId, MindmapLayoutItem | undefined>({
    initialList: [],
    emptyValue: undefined,
    read: (mindmapId) => {
      ensureSynced()
      return state.entryById.get(mindmapId)
    }
  })
  let snapshotRef: ReadSnapshot = initialSnapshot
  let state: MindmapLayoutProjectionState = {
    entryById: new Map<MindmapId, MindmapLayoutItem>(),
    ids: []
  }

  const buildLayout = (
    mindmapId: MindmapId
  ): MindmapLayoutItem | undefined => {
    const currentStructure = structure.get(mindmapId)
    const root = snapshotRef.document.nodes[currentStructure?.rootId ?? '']
    if (!currentStructure || !root) {
      return undefined
    }

    const computed = mindmapApi.layout.compute(
      currentStructure.tree,
      (nodeId) => {
        const node = snapshotRef.document.nodes[nodeId]
        const bootstrap = node
          ? nodeApi.bootstrap.resolve(node)
          : undefined

        return {
          width: Math.max(node?.size?.width ?? bootstrap?.width ?? config.mindmapNodeSize.width, 1),
          height: Math.max(node?.size?.height ?? bootstrap?.height ?? config.mindmapNodeSize.height, 1)
        }
      },
      currentStructure.layout
    )
    const anchored = mindmapApi.layout.anchor({
      tree: currentStructure.tree,
      computed,
      position: root.position
    })
    const render = mindmapApi.render.resolve({
      tree: currentStructure.tree,
      computed: anchored
    })

    return {
      id: mindmapId,
      rootId: currentStructure.rootId,
      nodeIds: currentStructure.nodeIds,
      computed: anchored,
      connectors: render.connectors
    }
  }

  const reconcile = (
    current: MindmapLayoutProjectionState
  ): MindmapLayoutProjectionUpdate => {
    const nodesRef = snapshotRef.document.nodes
    const mindmapsRef = snapshotRef.document.mindmaps
    if (nodesRef === current.nodesRef && mindmapsRef === current.mindmapsRef) {
      return {
        nextState: current,
        idsChanged: false,
        changedIds: new Set<MindmapId>()
      }
    }

    const structureIds = deps.list.get()
    const previousIds = current.ids
    const previousById = current.entryById
    const nextById = new Map<MindmapId, MindmapLayoutItem>()
    const nextIds: MindmapId[] = []
    const changedIds = new Set<MindmapId>()
    const removedIds = new Set(previousIds)

    structureIds.forEach((mindmapId) => {
      const nextLayout = buildLayout(mindmapId)
      if (!nextLayout) {
        return
      }

      nextById.set(mindmapId, nextLayout)
      nextIds.push(mindmapId)
      if (previousById.get(mindmapId) !== nextLayout) {
        changedIds.add(mindmapId)
      }
      removedIds.delete(mindmapId)
    })

    removedIds.forEach((mindmapId) => {
      changedIds.add(mindmapId)
    })

    const idsChanged = !isSameIds(previousIds, nextIds)

    return {
      nextState: {
        entryById: nextById,
        ids: idsChanged ? nextIds : previousIds,
        nodesRef,
        mindmapsRef
      },
      idsChanged,
      changedIds
    }
  }

  const ensureSynced = () => {
    const next = reconcile(state)
    if (next.nextState !== state) {
      state = next.nextState
    }
  }

  const initial = reconcile(state)
  state = initial.nextState
  projection.setList(state.ids)

  const applyChange = (
    _invalidation: Invalidation,
    snapshot: ReadSnapshot
  ) => {
    snapshotRef = snapshot
    const next = reconcile(state)
    state = next.nextState

    if (next.idsChanged) {
      projection.setList(state.ids)
    }

    projection.sync(next.changedIds)
  }

  return {
    item: projection.item,
    applyChange
  }
}
