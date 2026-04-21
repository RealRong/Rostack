import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type { Invalidation, MindmapId } from '@whiteboard/core/types'
import { createProjectionRuntime } from '@whiteboard/engine/read/store/projection'
import type { ReadSnapshot } from '@whiteboard/engine/types/internal/read'
import type { MindmapStructureItem } from '@whiteboard/engine/types/projection'

type MindmapStructureProjectionState = {
  entryById: Map<MindmapId, MindmapStructureItem>
  ids: readonly MindmapId[]
  mindmapsRef?: ReadSnapshot['document']['mindmaps']
}

type MindmapStructureProjectionUpdate = {
  nextState: MindmapStructureProjectionState
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

export const createMindmapStructureProjection = (
  initialSnapshot: ReadSnapshot
) => {
  const projection = createProjectionRuntime<MindmapId, MindmapStructureItem | undefined>({
    initialList: [],
    emptyValue: undefined,
    read: (mindmapId) => {
      ensureSynced()
      return state.entryById.get(mindmapId)
    }
  })
  let snapshotRef: ReadSnapshot = initialSnapshot
  let state: MindmapStructureProjectionState = {
    entryById: new Map<MindmapId, MindmapStructureItem>(),
    ids: []
  }

  const buildStructure = (
    mindmapId: MindmapId
  ): MindmapStructureItem | undefined => {
    const record = snapshotRef.document.mindmaps[mindmapId]
    if (!record) {
      return undefined
    }

    const tree = mindmapApi.tree.fromRecord(record)
    return {
      id: mindmapId,
      rootId: record.root,
      nodeIds: mindmapApi.tree.subtreeIds(tree, tree.rootNodeId),
      tree,
      topics: record.members,
      layout: tree.layout
    }
  }

  const reconcile = (
    current: MindmapStructureProjectionState
  ): MindmapStructureProjectionUpdate => {
    const mindmapsRef = snapshotRef.document.mindmaps
    if (mindmapsRef === current.mindmapsRef) {
      return {
        nextState: current,
        idsChanged: false,
        changedIds: new Set<MindmapId>()
      }
    }

    const previousIds = current.ids
    const previousById = current.entryById
    const nextById = new Map<MindmapId, MindmapStructureItem>()
    const nextIds: MindmapId[] = []
    const changedIds = new Set<MindmapId>()
    const removedIds = new Set(previousIds)

    Object.keys(mindmapsRef).forEach((mindmapId) => {
      const nextStructure = buildStructure(mindmapId)
      if (!nextStructure) {
        return
      }

      nextById.set(mindmapId, nextStructure)
      nextIds.push(mindmapId)
      if (previousById.get(mindmapId) !== nextStructure) {
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
    list: projection.list,
    item: projection.item,
    applyChange
  }
}
