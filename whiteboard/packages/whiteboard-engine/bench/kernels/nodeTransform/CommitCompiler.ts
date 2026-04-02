import { createNodeFieldsUpdateOperation } from '@whiteboard/core/node'
import { getNode, type Document, type NodeId, type Operation } from '@whiteboard/core/types'
import type { Size } from '@engine-types/common/base'
import type { Point } from '@whiteboard/core/types'
import { isPointEqual, isSizeEqual } from '@whiteboard/core/geometry'

type ResizeUpdate = {
  position: Point
  size: Size
}

type CompilerOptions = {
  readDoc: () => Document
}

export class CommitCompiler {
  private readonly readDoc: CompilerOptions['readDoc']

  constructor({ readDoc }: CompilerOptions) {
    this.readDoc = readDoc
  }

  compileResize = (
    nodeId: NodeId,
    update: ResizeUpdate | undefined
  ): Operation[] => {
    if (!update) return []
    const node = getNode(this.readDoc(), nodeId)
    if (!node) return []

    const patch: {
      position?: Point
      size?: Size
    } = {}

    if (!isPointEqual(update.position, node.position)) {
      patch.position = update.position
    }
    if (!isSizeEqual(update.size, node.size)) {
      patch.size = update.size
    }
    if (!patch.position && !patch.size) return []

    return [createNodeFieldsUpdateOperation(nodeId, patch)]
  }

  compileRotate = (
    nodeId: NodeId,
    rotation: number | undefined
  ): Operation[] => {
    if (typeof rotation !== 'number') return []
    const node = getNode(this.readDoc(), nodeId)
    if (!node) return []
    if ((node.rotation ?? 0) === rotation) return []
    return [createNodeFieldsUpdateOperation(nodeId, { rotation })]
  }
}
