import type { ResizeDirection, TextWidthMode } from '@whiteboard/core/node'
import type { NodeId, NodeUpdateInput, Origin } from '@whiteboard/core/types'
import type { CommandResult } from '@engine-types/result'

export type NodePatchWriter = {
  update: (id: NodeId, update: NodeUpdateInput) => CommandResult
  updateMany: (
    updates: readonly {
      id: NodeId
      update: NodeUpdateInput
    }[],
    options?: {
      origin?: Origin
    }
  ) => CommandResult
}

export type NodeTextMutations = {
  preview: (input: {
    nodeId: NodeId
    position?: {
      x: number
      y: number
    }
    size?: {
      width: number
      height: number
    }
    fontSize?: number
    mode?: TextWidthMode
    wrapWidth?: number
    handle?: ResizeDirection
  }) => void
  clearPreview: (nodeId: NodeId) => void
  cancel: (input: {
    nodeId: NodeId
  }) => void
  commit: (input: {
    nodeId: NodeId
    field: 'text' | 'title'
    value: string
    size?: {
      width: number
      height: number
    }
  }) => CommandResult | undefined
  setColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
  setSize: (input: {
    nodeIds: readonly NodeId[]
    value?: number
    sizeById?: Readonly<Record<NodeId, { width: number; height: number }>>
  }) => CommandResult
  setWeight: (nodeIds: readonly NodeId[], weight?: number) => CommandResult
  setItalic: (nodeIds: readonly NodeId[], italic: boolean) => CommandResult
  setAlign: (
    nodeIds: readonly NodeId[],
    align?: 'left' | 'center' | 'right'
  ) => CommandResult
}
