import type { CommandResult } from '@engine-types/result'
import type { NodeId } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { NodePatchWriter } from './types'
import {
  dataUpdate,
  styleUpdate
} from './patch'

export type NodeLockMutations = {
  set: (nodeIds: readonly NodeId[], locked: boolean) => CommandResult
  toggle: (nodeIds: readonly NodeId[]) => CommandResult
}

export type NodeShapeMutations = {
  setKind: (nodeIds: readonly NodeId[], kind: string) => CommandResult
}

export type NodeAppearanceMutations = {
  setFill: (nodeIds: readonly NodeId[], fill: string) => CommandResult
  setFillOpacity: (nodeIds: readonly NodeId[], opacity?: number) => CommandResult
  setStroke: (nodeIds: readonly NodeId[], stroke: string) => CommandResult
  setStrokeWidth: (nodeIds: readonly NodeId[], width: number) => CommandResult
  setStrokeOpacity: (nodeIds: readonly NodeId[], opacity?: number) => CommandResult
  setStrokeDash: (nodeIds: readonly NodeId[], dash?: readonly number[]) => CommandResult
  setOpacity: (nodeIds: readonly NodeId[], opacity: number) => CommandResult
  setTextColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
}

export type NodeMutations = {
  lock: NodeLockMutations
  shape: NodeShapeMutations
  appearance: NodeAppearanceMutations
}

export const createNodeMutations = ({
  engine,
  document
}: {
  engine: Engine
  document: NodePatchWriter
}): NodeMutations => {
  const appearance: NodeAppearanceMutations = {
    setFill: (nodeIds, fill) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('fill', fill)
      }))
    ),
    setFillOpacity: (nodeIds, opacity) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('fillOpacity', opacity)
      }))
    ),
    setStroke: (nodeIds, stroke) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('stroke', stroke)
      }))
    ),
    setStrokeWidth: (nodeIds, width) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('strokeWidth', width)
      }))
    ),
    setStrokeOpacity: (nodeIds, opacity) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('strokeOpacity', opacity)
      }))
    ),
    setStrokeDash: (nodeIds, dash) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('strokeDash', dash)
      }))
    ),
    setOpacity: (nodeIds, opacity) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('opacity', opacity)
      }))
    ),
    setTextColor: (nodeIds, color) => document.updateMany(
      nodeIds.map((id) => ({
        id,
        update: styleUpdate('color', color)
      }))
    )
  }

  const setLock: NodeLockMutations['set'] = (nodeIds, locked) => document.updateMany(
    nodeIds.map((id) => ({
      id,
      update: {
        fields: {
          locked
        }
      }
    }))
  )

  const lock: NodeLockMutations = {
    set: setLock,
    toggle: (nodeIds) => {
      const shouldLock = nodeIds.some((id) => !engine.read.node.item.get(id)?.node.locked)
      return setLock(nodeIds, shouldLock)
    }
  }

  const shape: NodeShapeMutations = {
    setKind: (nodeIds, kind) => document.updateMany(
      nodeIds.flatMap((id) => {
        const node = engine.read.node.item.get(id)?.node
        if (node?.type !== 'shape') {
          return []
        }

        return [{
          id,
          update: dataUpdate('kind', kind)
        }]
      })
    )
  }

  return {
    lock,
    shape,
    appearance
  }
}
