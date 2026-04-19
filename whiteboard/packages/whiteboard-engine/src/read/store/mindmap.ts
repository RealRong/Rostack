import type { MindmapItem } from '@whiteboard/engine/types/projection'
import type { Invalidation, MindmapId, Node, NodeId } from '@whiteboard/core/types'
import type { BoardConfig } from '@whiteboard/engine/types/instance'
import {
  anchorMindmapLayout,
  computeMindmapLayout,
  getMindmapTreeFromDocument,
  getSubtreeIds,
  resolveMindmapRender
} from '@whiteboard/core/mindmap'
import {
  resolveNodeBootstrapSize
} from '@whiteboard/core/node'
import type { ReadSnapshot } from '@whiteboard/engine/types/internal/read'
import { createProjectionRuntime } from '@whiteboard/engine/read/store/projection'

type MindmapProjectionState = {
  entryById: Map<MindmapId, MindmapItem>
  ids: readonly MindmapId[]
  nodesRef?: ReadSnapshot['document']['nodes']
  mindmapsRef?: ReadSnapshot['document']['mindmaps']
}

type MindmapProjectionUpdate = {
  nextState: MindmapProjectionState
  idsChanged: boolean
  changedTreeIds: Set<MindmapId>
}

const isSameIds = (left: readonly MindmapId[], right: readonly MindmapId[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

export const createMindmapProjection = (
  initialSnapshot: ReadSnapshot,
  deps: {
    config: BoardConfig
  }
) => {
  const config = deps.config
  const projection = createProjectionRuntime<MindmapId, MindmapItem | undefined>({
    initialList: [],
    emptyValue: undefined,
    read: (treeId) => {
      ensureSynced()
      return state.entryById.get(treeId)
    }
  })
  let snapshotRef: ReadSnapshot = initialSnapshot
  let state: MindmapProjectionState = {
    entryById: new Map<MindmapId, MindmapItem>(),
    ids: []
  }

  const buildTree = (
    mindmapId: MindmapId
  ): MindmapItem | undefined => {
    const tree = getMindmapTreeFromDocument(snapshotRef.document, mindmapId)
    const root = snapshotRef.document.nodes[snapshotRef.document.mindmaps[mindmapId]?.root ?? '']
    if (!tree || !root) {
      return undefined
    }

    const childNodeIds = getSubtreeIds(tree, tree.rootNodeId)
    const computed = computeMindmapLayout(
      tree,
      (nodeId) => {
        const node = snapshotRef.document.nodes[nodeId]
        const bootstrap = node
          ? resolveNodeBootstrapSize(node)
          : undefined
        return {
          width: Math.max(node?.size?.width ?? bootstrap?.width ?? config.mindmapNodeSize.width, 1),
          height: Math.max(node?.size?.height ?? bootstrap?.height ?? config.mindmapNodeSize.height, 1)
        }
      },
      tree.layout
    )
    const anchored = anchorMindmapLayout({
      tree,
      computed,
      position: root.position
    })
    const render = resolveMindmapRender({
      tree,
      computed: anchored
    })

    return {
      id: mindmapId,
      node: root,
      tree,
      layout: tree.layout,
      computed: anchored,
      rootLocked: Boolean(root.locked),
      childNodeIds,
      connectors: render.connectors
    }
  }

  const commitState = (nextState: MindmapProjectionState) => {
    state = nextState
  }

  const reconcile = (
    current: MindmapProjectionState
  ): MindmapProjectionUpdate => {
    const nodesRef = snapshotRef.document.nodes
    const mindmapsRef = snapshotRef.document.mindmaps
    if (nodesRef === current.nodesRef && mindmapsRef === current.mindmapsRef) {
      return {
        nextState: current,
        idsChanged: false,
        changedTreeIds: new Set<MindmapId>()
      }
    }

    const previousIds = current.ids
    const previousById = current.entryById
    const nextById = new Map<MindmapId, MindmapItem>()
    const nextIds: MindmapId[] = []
    const changedTreeIds = new Set<MindmapId>()
    const previousTreeIds = new Set(previousIds)

    Object.keys(mindmapsRef).forEach((mindmapId) => {
      const nextTree = buildTree(mindmapId)
      if (!nextTree) return
      nextById.set(mindmapId, nextTree)
      nextIds.push(mindmapId)
      if (previousById.get(mindmapId) !== nextTree) {
        changedTreeIds.add(mindmapId)
      }
      previousTreeIds.delete(mindmapId)
    })

    previousTreeIds.forEach((treeId) => {
      changedTreeIds.add(treeId)
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
      changedTreeIds
    }
  }

  const ensureSynced = () => {
    const next = reconcile(state)
    if (next.nextState !== state) {
      commitState(next.nextState)
    }
  }

  const initial = reconcile(state)
  commitState(initial.nextState)
  projection.setList(state.ids)

  const applyChange = (_invalidation: Invalidation, snapshot: ReadSnapshot) => {
    snapshotRef = snapshot
    const next = reconcile(state)
    commitState(next.nextState)

    if (next.idsChanged) {
      projection.setList(state.ids)
    }

    projection.sync(next.changedTreeIds)
  }

  return {
    list: projection.list,
    item: projection.item,
    applyChange
  }
}
