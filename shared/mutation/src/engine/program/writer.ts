import type {
  MutationDeltaInput,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationTreeSubtreeSnapshot,
} from '../../write'
import type {
  MutationProgram,
  MutationProgramStep,
  MutationEntityRef,
} from './program'

export interface MutationProgramWriter<
  Tag extends string = string
> {
  entity: {
    create(
      entity: MutationEntityRef,
      value: unknown,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    patch(
      entity: MutationEntityRef,
      writes: Readonly<Record<string, unknown>>,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    patchMany(
      table: string,
      updates: readonly {
        id: string
        writes: Readonly<Record<string, unknown>>
      }[],
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    delete(
      entity: MutationEntityRef,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
  }
  ordered: {
    insert(
      structure: string,
      itemId: string,
      value: unknown,
      to: MutationOrderedAnchor,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    move(
      structure: string,
      itemId: string,
      to: MutationOrderedAnchor,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    splice(
      structure: string,
      itemIds: readonly string[],
      to: MutationOrderedAnchor,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    delete(
      structure: string,
      itemId: string,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    patch(
      structure: string,
      itemId: string,
      patch: unknown,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
  }
  tree: {
    insert(
      structure: string,
      nodeId: string,
      parentId?: string,
      index?: number,
      value?: unknown,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    move(
      structure: string,
      nodeId: string,
      parentId?: string,
      index?: number,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    delete(
      structure: string,
      nodeId: string,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    restore(
      structure: string,
      snapshot: MutationTreeSubtreeSnapshot,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    patch(
      structure: string,
      nodeId: string,
      patch: unknown,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
  }
  build(): MutationProgram<Tag>
}

export const createMutationProgramWriter = <
  Tag extends string = string
>(): MutationProgramWriter<Tag> => {
  const steps: MutationProgramStep<Tag>[] = []

  return {
    entity: {
      create: (entity, value, tags, metadata) => {
        steps.push({
          type: 'entity.create',
          entity,
          value,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      patch: (entity, writes, tags, metadata) => {
        steps.push({
          type: 'entity.patch',
          entity,
          writes,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      patchMany: (table, updates, tags, metadata) => {
        steps.push({
          type: 'entity.patchMany',
          table,
          updates,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      delete: (entity, tags, metadata) => {
        steps.push({
          type: 'entity.delete',
          entity,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      }
    },
    ordered: {
      insert: (structure, itemId, value, to, tags, metadata) => {
        steps.push({
          type: 'ordered.insert',
          structure,
          itemId,
          value,
          to,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      move: (structure, itemId, to, tags, metadata) => {
        steps.push({
          type: 'ordered.move',
          structure,
          itemId,
          to,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      splice: (structure, itemIds, to, tags, metadata) => {
        steps.push({
          type: 'ordered.splice',
          structure,
          itemIds,
          to,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      delete: (structure, itemId, tags, metadata) => {
        steps.push({
          type: 'ordered.delete',
          structure,
          itemId,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      patch: (structure, itemId, patch, tags, metadata) => {
        steps.push({
          type: 'ordered.patch',
          structure,
          itemId,
          patch,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      }
    },
    tree: {
      insert: (structure, nodeId, parentId, index, value, tags, metadata) => {
        steps.push({
          type: 'tree.insert',
          structure,
          nodeId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(index === undefined ? {} : { index }),
          ...(value === undefined ? {} : { value }),
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      move: (structure, nodeId, parentId, index, tags, metadata) => {
        steps.push({
          type: 'tree.move',
          structure,
          nodeId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(index === undefined ? {} : { index }),
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      delete: (structure, nodeId, tags, metadata) => {
        steps.push({
          type: 'tree.delete',
          structure,
          nodeId,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      restore: (structure, snapshot, tags, metadata) => {
        steps.push({
          type: 'tree.restore',
          structure,
          snapshot,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      patch: (structure, nodeId, patch, tags, metadata) => {
        steps.push({
          type: 'tree.node.patch',
          structure,
          nodeId,
          patch,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      }
    },
    build: () => ({
      steps: [...steps]
    })
  }
}
