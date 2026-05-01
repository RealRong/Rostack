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
import type {
  MutationOrderedTarget,
  MutationTreeTarget,
} from '../registry'

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
      entityType: string,
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
      target: MutationOrderedTarget,
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
      target: MutationOrderedTarget,
      itemId: string,
      to: MutationOrderedAnchor,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    splice(
      target: MutationOrderedTarget,
      itemIds: readonly string[],
      to: MutationOrderedAnchor,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    delete(
      target: MutationOrderedTarget,
      itemId: string,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    patch(
      target: MutationOrderedTarget,
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
      target: MutationTreeTarget,
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
      target: MutationTreeTarget,
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
      target: MutationTreeTarget,
      nodeId: string,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    restore(
      target: MutationTreeTarget,
      snapshot: MutationTreeSubtreeSnapshot,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
    patch(
      target: MutationTreeTarget,
      nodeId: string,
      patch: unknown,
      tags?: readonly Tag[],
      metadata?: {
        delta?: MutationDeltaInput
        footprint?: readonly MutationFootprint[]
      }
    ): void
  }
  signal(
    delta: MutationDeltaInput,
    tags?: readonly Tag[],
    metadata?: {
      footprint?: readonly MutationFootprint[]
    }
  ): void
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
      patchMany: (entityType, updates, tags, metadata) => {
        steps.push({
          type: 'entity.patchMany',
          entityType,
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
      insert: (target, itemId, value, to, tags, metadata) => {
        steps.push({
          type: 'ordered.insert',
          target,
          itemId,
          value,
          to,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      move: (target, itemId, to, tags, metadata) => {
        steps.push({
          type: 'ordered.move',
          target,
          itemId,
          to,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      splice: (target, itemIds, to, tags, metadata) => {
        steps.push({
          type: 'ordered.splice',
          target,
          itemIds,
          to,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      delete: (target, itemId, tags, metadata) => {
        steps.push({
          type: 'ordered.delete',
          target,
          itemId,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      patch: (target, itemId, patch, tags, metadata) => {
        steps.push({
          type: 'ordered.patch',
          target,
          itemId,
          patch,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      }
    },
    tree: {
      insert: (target, nodeId, parentId, index, value, tags, metadata) => {
        steps.push({
          type: 'tree.insert',
          target,
          nodeId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(index === undefined ? {} : { index }),
          ...(value === undefined ? {} : { value }),
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      move: (target, nodeId, parentId, index, tags, metadata) => {
        steps.push({
          type: 'tree.move',
          target,
          nodeId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(index === undefined ? {} : { index }),
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      delete: (target, nodeId, tags, metadata) => {
        steps.push({
          type: 'tree.delete',
          target,
          nodeId,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      restore: (target, snapshot, tags, metadata) => {
        steps.push({
          type: 'tree.restore',
          target,
          snapshot,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      },
      patch: (target, nodeId, patch, tags, metadata) => {
        steps.push({
          type: 'tree.node.patch',
          target,
          nodeId,
          patch,
          ...(tags === undefined ? {} : { tags }),
          ...(metadata?.delta === undefined ? {} : { delta: metadata.delta }),
          ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
        })
      }
    },
    signal: (delta, tags, metadata) => {
      steps.push({
        type: 'signal',
        delta,
        ...(tags === undefined ? {} : { tags }),
        ...(metadata?.footprint === undefined ? {} : { footprint: metadata.footprint })
      })
    },
    build: () => ({
      steps: [...steps]
    })
  }
}
