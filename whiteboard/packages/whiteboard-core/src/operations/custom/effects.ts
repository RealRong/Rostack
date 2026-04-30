import type {
  MutationFootprint,
  MutationStructuralCanonicalOperation
} from '@shared/mutation'
import {
  clone
} from './common'
import type {
  WhiteboardCustomPlanContext
} from './types'

export const emitSemanticChange = (
  input: Pick<WhiteboardCustomPlanContext, 'effects'>,
  key: string,
  change?: import('@shared/mutation').MutationChangeInput
): void => {
  input.effects.semantic.change(key, change)
}

export const emitSemanticFootprint = (
  input: Pick<WhiteboardCustomPlanContext, 'effects'>,
  footprint: readonly MutationFootprint[]
): void => {
  if (footprint.length === 0) {
    return
  }

  input.effects.semantic.footprint(footprint)
}

export const emitStructuralOperation = (
  input: Pick<WhiteboardCustomPlanContext, 'effects'>,
  operation: MutationStructuralCanonicalOperation
): void => {
  switch (operation.type) {
    case 'structural.ordered.insert':
      input.effects.structure.ordered.insert(
        operation.structure,
        operation.itemId,
        clone(operation.value)!,
        clone(operation.to)!
      )
      return
    case 'structural.ordered.move':
      input.effects.structure.ordered.move(
        operation.structure,
        operation.itemId,
        clone(operation.to)!
      )
      return
    case 'structural.ordered.splice':
      input.effects.structure.ordered.splice(
        operation.structure,
        [...operation.itemIds],
        clone(operation.to)!
      )
      return
    case 'structural.ordered.delete':
      input.effects.structure.ordered.delete(
        operation.structure,
        operation.itemId
      )
      return
    case 'structural.tree.insert':
      input.effects.structure.tree.insert(
        operation.structure,
        operation.nodeId,
        operation.parentId,
        operation.index,
        clone(operation.value)!
      )
      return
    case 'structural.tree.move':
      input.effects.structure.tree.move(
        operation.structure,
        operation.nodeId,
        operation.parentId,
        operation.index
      )
      return
    case 'structural.tree.delete':
      input.effects.structure.tree.delete(
        operation.structure,
        operation.nodeId
      )
      return
    case 'structural.tree.restore':
      input.effects.structure.tree.restore(
        operation.structure,
        clone(operation.snapshot)!
      )
  }
}

export const emitEntityCreate = (
  input: Pick<WhiteboardCustomPlanContext, 'effects'>,
  table: string,
  id: string,
  value: unknown
): void => {
  input.effects.entity.create({
    table,
    id
  }, clone(value)!)
}

export const emitEntityDelete = (
  input: Pick<WhiteboardCustomPlanContext, 'effects'>,
  table: string,
  id: string
): void => {
  input.effects.entity.delete({
    table,
    id
  })
}

export const emitEntityPatch = (
  input: Pick<WhiteboardCustomPlanContext, 'effects'>,
  table: string,
  id: string,
  writes: Readonly<Record<string, unknown>>
): void => {
  if (Object.keys(writes).length === 0) {
    return
  }

  input.effects.entity.patch({
    table,
    id
  }, writes)
}
