import type {
  CompiledEntitySpec
} from '../contracts'
import {
  createCanonicalCreateOperation,
  createCanonicalDeleteOperation,
  createCanonicalPatchOperation,
  createPatchFromWrites,
} from '../entity'
import {
  createStructuralOrderedDeleteOperation,
  createStructuralOrderedInsertOperation,
  createStructuralOrderedMoveOperation,
  createStructuralOrderedSpliceOperation,
  createStructuralTreeDeleteOperation,
  createStructuralTreeInsertOperation,
  createStructuralTreeMoveOperation,
  createStructuralTreeRestoreOperation,
} from '../structural'
import type {
  MutationEffectProgram
} from './effect'

const readEntitySpec = (
  entities: ReadonlyMap<string, CompiledEntitySpec>,
  table: string
): CompiledEntitySpec => {
  const spec = entities.get(table)
  if (!spec) {
    throw new Error(`Unknown mutation entity family "${table}".`)
  }

  return spec
}

export const materializeMutationEffectProgram = <
  Op extends {
    type: string
  }
>(input: {
  program: MutationEffectProgram<string>
  entities: ReadonlyMap<string, CompiledEntitySpec>
}): readonly Op[] => {
  const operations: Op[] = []

  input.program.effects.forEach((effect) => {
    switch (effect.type) {
      case 'entity.create': {
        const spec = readEntitySpec(input.entities, effect.entity.table)
        operations.push(
          createCanonicalCreateOperation<Op>(spec.createType, effect.value)
        )
        return
      }
      case 'entity.patch': {
        const spec = readEntitySpec(input.entities, effect.entity.table)
        operations.push(
          createCanonicalPatchOperation<Op>(
            spec.patchType,
            spec.kind === 'singleton'
              ? undefined
              : effect.entity.id,
            createPatchFromWrites(effect.writes)
          )
        )
        return
      }
      case 'entity.patchMany': {
        const spec = readEntitySpec(input.entities, effect.table)
        effect.updates.forEach((update) => {
          operations.push(
            createCanonicalPatchOperation<Op>(
              spec.patchType,
              spec.kind === 'singleton'
                ? undefined
                : update.id,
              createPatchFromWrites(update.writes)
            )
          )
        })
        return
      }
      case 'entity.delete': {
        const spec = readEntitySpec(input.entities, effect.entity.table)
        operations.push(
          createCanonicalDeleteOperation<Op>(
            spec.deleteType,
            spec.kind === 'singleton'
              ? undefined
              : effect.entity.id
          )
        )
        return
      }
      case 'ordered.insert':
        operations.push(createStructuralOrderedInsertOperation<Op>({
          structure: effect.structure,
          itemId: effect.itemId,
          value: effect.value,
          to: effect.to
        }))
        return
      case 'ordered.move':
        operations.push(createStructuralOrderedMoveOperation<Op>({
          structure: effect.structure,
          itemId: effect.itemId,
          to: effect.to
        }))
        return
      case 'ordered.splice':
        operations.push(createStructuralOrderedSpliceOperation<Op>({
          structure: effect.structure,
          itemIds: effect.itemIds,
          to: effect.to
        }))
        return
      case 'ordered.delete':
        operations.push(createStructuralOrderedDeleteOperation<Op>({
          structure: effect.structure,
          itemId: effect.itemId
        }))
        return
      case 'tree.insert':
        operations.push(createStructuralTreeInsertOperation<Op>({
          structure: effect.structure,
          nodeId: effect.nodeId,
          ...(effect.parentId === undefined
            ? {}
            : {
                parentId: effect.parentId
              }),
          ...(effect.index === undefined
            ? {}
            : {
                index: effect.index
              }),
          ...(effect.value === undefined
            ? {}
            : {
                value: effect.value
              })
        }))
        return
      case 'tree.move':
        operations.push(createStructuralTreeMoveOperation<Op>({
          structure: effect.structure,
          nodeId: effect.nodeId,
          ...(effect.parentId === undefined
            ? {}
            : {
                parentId: effect.parentId
              }),
          ...(effect.index === undefined
            ? {}
            : {
                index: effect.index
              })
        }))
        return
      case 'tree.delete':
        operations.push(createStructuralTreeDeleteOperation<Op>({
          structure: effect.structure,
          nodeId: effect.nodeId
        }))
        return
      case 'tree.restore':
        operations.push(createStructuralTreeRestoreOperation<Op>({
          structure: effect.structure,
          snapshot: effect.snapshot
        }))
        return
      case 'semantic.tag':
      case 'semantic.change':
      case 'semantic.footprint':
        return
    }
  })

  return operations
}
