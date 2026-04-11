import type {
  NodeAlignMode,
  NodeDistributeMode,
  ResizeDirection,
  TextWidthMode
} from '@whiteboard/core/node'
import type {
  NodeId,
  NodeUpdateInput,
  Origin,
  Point,
  Size
} from '@whiteboard/core/types'
import type { CommandResult } from '@engine-types/result'
import type { NodeApi } from '../../types/commands'

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

export type NodeTextCommands = {
  preview: (input: {
    nodeId: NodeId
    position?: Point
    size?: Size
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
    size?: Size
  }) => CommandResult | undefined
  color: (nodeIds: readonly NodeId[], color: string) => CommandResult
  size: (input: {
    nodeIds: readonly NodeId[]
    value?: number
    sizeById?: Readonly<Record<NodeId, Size>>
  }) => CommandResult
  weight: (nodeIds: readonly NodeId[], weight?: number) => CommandResult
  italic: (nodeIds: readonly NodeId[], italic: boolean) => CommandResult
  align: (
    nodeIds: readonly NodeId[],
    align?: 'left' | 'center' | 'right'
  ) => CommandResult
}

export type NodeLockCommands = {
  set: (nodeIds: readonly NodeId[], locked: boolean) => CommandResult
  toggle: (nodeIds: readonly NodeId[]) => CommandResult
}

export type NodeShapeCommands = {
  set: (nodeIds: readonly NodeId[], kind: string) => CommandResult
}

export type NodeStyleCommands = {
  fill: (nodeIds: readonly NodeId[], value: string) => CommandResult
  fillOpacity: (nodeIds: readonly NodeId[], value?: number) => CommandResult
  stroke: (nodeIds: readonly NodeId[], value: string) => CommandResult
  strokeWidth: (nodeIds: readonly NodeId[], value: number) => CommandResult
  strokeOpacity: (nodeIds: readonly NodeId[], value?: number) => CommandResult
  strokeDash: (nodeIds: readonly NodeId[], value?: readonly number[]) => CommandResult
  opacity: (nodeIds: readonly NodeId[], value: number) => CommandResult
  textColor: (nodeIds: readonly NodeId[], value: string) => CommandResult
}

export type NodeCommands = {
  create: NodeApi['create']
  patch: NodeApi['patch']
  move: (input: {
    ids: readonly NodeId[]
    delta: Point
  }) => CommandResult
  align: (ids: readonly NodeId[], mode: NodeAlignMode) => CommandResult
  distribute: (ids: readonly NodeId[], mode: NodeDistributeMode) => CommandResult
  delete: (ids: NodeId[]) => CommandResult
  deleteCascade: (ids: NodeId[]) => CommandResult
  duplicate: NodeApi['duplicate']
  update: NodePatchWriter['update']
  updateMany: NodePatchWriter['updateMany']
  lock: NodeLockCommands
  shape: NodeShapeCommands
  style: NodeStyleCommands
  text: NodeTextCommands
}
