import type { BoardConfig } from '@engine-types/instance/config'
import type { NodeDragDraft } from '@engine-types/node/drag'
import { getNode } from '@whiteboard/core/document'
import type { Document, Node, NodeId, Operation, Point } from '@whiteboard/core/types'
import { getNodeAABB, isPointEqual, isSizeEqual, rectContains } from '@whiteboard/core/geometry'
import {
  expandGroupRect,
  createNodeFieldsUpdateOperation,
  getGroupDescendants,
  getNodesBoundingRect,
  rectEquals
} from '@whiteboard/core/node'
import { DEFAULT_TUNING } from '../../../src/config'

type CompilerOptions = {
  readDoc: () => Document
  readCanvasNodes: () => Node[]
  config: Pick<BoardConfig, 'node' | 'nodeSize'>
}

type NodePreviewUpdate = {
  id: NodeId
  position?: Point
  size?: { width: number; height: number }
  rotation?: number
}

type CompileInput = {
  draft: NodeDragDraft
  finalPosition: Point
  updates: NodePreviewUpdate[]
  hoveredGroupId?: NodeId
}

type NodeCommitPatch = {
  position?: Point
  size?: { width: number; height: number }
  parentId?: NodeId
}

const hasParentIdPatch = (patch: NodeCommitPatch): patch is NodeCommitPatch & { parentId: NodeId | undefined } =>
  Object.prototype.hasOwnProperty.call(patch, 'parentId')

const readParentId = (node: Node): NodeId | undefined =>
  (node as Node & { parentId?: NodeId }).parentId

const toNodeById = (nodes: Node[]) =>
  new Map(nodes.map((node) => [node.id, node]))

export class CommitCompiler {
  private readonly readDoc: CompilerOptions['readDoc']
  private readonly readCanvasNodes: CompilerOptions['readCanvasNodes']
  private readonly config: CompilerOptions['config']

  constructor(options: CompilerOptions) {
    this.readDoc = options.readDoc
    this.readCanvasNodes = options.readCanvasNodes
    this.config = options.config
  }

  compile = ({
    draft,
    finalPosition,
    updates,
    hoveredGroupId
  }: CompileInput): Operation[] => {
    const patches = new Map<NodeId, NodeCommitPatch>()
    updates.forEach((update) => {
      const patch: NodeCommitPatch = {}
      if (update.position) patch.position = update.position
      if (update.size) patch.size = update.size
      this.mergePatch(patches, update.id, patch)
    })

    if (!draft.children && draft.nodeType !== 'group') {
      this.appendDropToGroupPatch(
        patches,
        draft,
        finalPosition,
        hoveredGroupId
      )
    }

    return this.toOperations(patches)
  }

  private mergePatch = (
    patches: Map<NodeId, NodeCommitPatch>,
    id: NodeId,
    patch: NodeCommitPatch
  ) => {
    if (!Object.keys(patch).length) return
    const prev = patches.get(id)
    patches.set(id, prev ? { ...prev, ...patch } : { ...patch })
  }

  private appendDropToGroupPatch = (
    patches: Map<NodeId, NodeCommitPatch>,
    draft: NodeDragDraft,
    finalPosition: Point,
    hoveredGroupId?: NodeId
  ) => {
    const nodes = this.readCanvasNodes()
    const nodeById = toNodeById(nodes)
    const currentNode = nodeById.get(draft.nodeId)
    if (!currentNode) return

    const parentId = readParentId(currentNode)

    if (hoveredGroupId && hoveredGroupId !== parentId) {
      const hovered = nodeById.get(hoveredGroupId)
      if (!hovered) return

      this.mergePatch(patches, draft.nodeId, { parentId: hovered.id })

      const groupRect = getNodeAABB(hovered, this.config.nodeSize)
      const children = getGroupDescendants(nodes, hovered.id)
      const virtualNode: Node = {
        ...currentNode,
        position: finalPosition
      }
      const contentRect = getNodesBoundingRect(
        [...children, virtualNode],
        this.config.nodeSize
      )
      if (!contentRect) return

      const padding = (
        hovered.data &&
        typeof hovered.data.padding === 'number'
      )
        ? hovered.data.padding
        : this.config.node.groupPadding
      const expanded = expandGroupRect(groupRect, contentRect, padding)
      if (rectEquals(expanded, groupRect, DEFAULT_TUNING.group.rectEpsilon)) {
        return
      }

      this.mergePatch(patches, hovered.id, {
        position: {
          x: expanded.x,
          y: expanded.y
        },
        size: {
          width: expanded.width,
          height: expanded.height
        }
      })
      return
    }

    if (!hoveredGroupId && parentId) {
      const parentNode = nodeById.get(parentId)
      if (!parentNode) return

      const nodeRect = {
        x: finalPosition.x,
        y: finalPosition.y,
        width: draft.size.width,
        height: draft.size.height
      }
      const parentRect = getNodeAABB(parentNode, this.config.nodeSize)
      if (!rectContains(parentRect, nodeRect)) {
        this.mergePatch(patches, draft.nodeId, { parentId: undefined })
      }
    }
  }

  private normalizePatch = (
    currentNode: Node,
    patch: NodeCommitPatch
  ): NodeCommitPatch | undefined => {
    const normalized: NodeCommitPatch = {}

    if (patch.position && !isPointEqual(patch.position, currentNode.position)) {
      normalized.position = patch.position
    }
    if (patch.size && !isSizeEqual(patch.size, currentNode.size)) {
      normalized.size = patch.size
    }
    if (
      hasParentIdPatch(patch) &&
      patch.parentId !== readParentId(currentNode)
    ) {
      normalized.parentId = patch.parentId
    }

    return Object.keys(normalized).length ? normalized : undefined
  }

  private toOperations = (patches: Map<NodeId, NodeCommitPatch>): Operation[] => {
    if (!patches.size) return []

    const doc = this.readDoc()
    const operations: Operation[] = []
    patches.forEach((patch, id) => {
      const currentNode = getNode(doc, id)
      if (!currentNode) return
      const normalized = this.normalizePatch(currentNode, patch)
      if (!normalized) return
      if (!normalized.position && !normalized.size) return
      const fields: {
        position?: Point
        size?: { width: number; height: number }
      } = {}
      if (normalized.position) {
        fields.position = normalized.position
      }
      if (normalized.size) {
        fields.size = normalized.size
      }
      operations.push(createNodeFieldsUpdateOperation(id, fields))
    })

    return operations
  }
}
