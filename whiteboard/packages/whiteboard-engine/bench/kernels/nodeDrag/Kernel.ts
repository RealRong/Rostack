import type { PointerInput } from '@engine-types/common/input'
import type { EngineContext } from '@engine-types/instance/engine'
import type { NodeDragDraft, NodeDragUpdateConstraints } from '@engine-types/node/drag'
import type { Guide } from '@engine-types/node/snap'
import type { Document, Node, NodeId, Operation, Point, Size } from '@whiteboard/core/types'
import { CommitCompiler } from './CommitCompiler'
import { Rules } from './Rules'

type KernelInstance = {
  read: EngineContext['read']
  viewport: EngineContext['viewport']
  config: EngineContext['config']
  document: {
    get: () => Document
  }
}

type KernelOptions = {
  instance: KernelInstance
}

type BeginDragInput = {
  nodeId: NodeId
  pointer: PointerInput
}

type NodePreviewUpdate = {
  id: NodeId
  position?: Point
  size?: Size
  rotation?: number
}

type KernelUpdateResult = {
  nodePreview: NodePreviewUpdate[]
  guides: Guide[]
  groupHover?: NodeId
}

export class NodeDragKernel {
  private readonly nodeSize: KernelInstance['config']['nodeSize']
  private readonly readCanvasNodes: () => Node[]
  private readonly rules: Rules
  private readonly commitCompiler: CommitCompiler

  constructor({ instance }: KernelOptions) {
    this.nodeSize = instance.config.nodeSize
    this.readCanvasNodes = () =>
      instance.read.index.node.all().map((entry) => entry.node)
    this.rules = new Rules({
      config: instance.config,
      read: instance.read,
      readZoom: () => instance.viewport.get().zoom,
      readCanvasNodes: this.readCanvasNodes
    })
    this.commitCompiler = new CommitCompiler({
      readDoc: instance.document.get,
      readCanvasNodes: this.readCanvasNodes,
      config: instance.config
    })
  }

  begin = (options: BeginDragInput): NodeDragDraft | undefined => {
    const nodes = this.readCanvasNodes()
    const node = nodes.find((item) => item.id === options.nodeId)
    if (!node || node.locked) return undefined

    const size = {
      width: node.size?.width ?? this.nodeSize.width,
      height: node.size?.height ?? this.nodeSize.height
    }
    const origin = {
      x: node.position.x,
      y: node.position.y
    }

    return {
      pointerId: options.pointer.pointerId,
      nodeId: node.id,
      nodeType: node.type,
      start: {
        x: options.pointer.client.x,
        y: options.pointer.client.y
      },
      origin,
      last: origin,
      size,
      children:
        node.type === 'group'
          ? this.rules.buildGroupChildren(nodes, node.id, origin)
          : undefined
    }
  }

  update = (
    draft: NodeDragDraft,
    pointer: PointerInput,
    constraints: NodeDragUpdateConstraints
  ): KernelUpdateResult => {
    const resolved = this.rules.resolveMove({
      nodeId: draft.nodeId,
      position: this.rules.resolvePosition(draft, pointer),
      size: draft.size,
      childrenIds: draft.children?.ids,
      snapEnabled: constraints.snapEnabled,
      allowCross: constraints.allowCross
    })
    const nextPosition = resolved.position
    const nodePreview = draft.children
      ? this.rules.buildGroupUpdates(draft, nextPosition)
      : [{
        id: draft.nodeId,
        position: nextPosition
      }]

    draft.last = nextPosition
    draft.hoveredGroupId = draft.children
      ? undefined
      : this.rules.resolveHoveredGroup(
        draft.nodeId,
        draft.size,
        nextPosition
      )

    return {
      nodePreview,
      guides: resolved.guides,
      groupHover: draft.hoveredGroupId
    }
  }

  commit = (
    draft: NodeDragDraft
  ): Operation[] => {
    const finalPosition = draft.last
    const updates = draft.children
      ? this.rules.buildGroupUpdates(draft, finalPosition)
      : [{
        id: draft.nodeId,
        position: finalPosition
      }]

    return this.commitCompiler.compile({
      draft,
      finalPosition,
      updates,
      hoveredGroupId: draft.hoveredGroupId
    })
  }
}
