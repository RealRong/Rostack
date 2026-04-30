import type {
  MutationChangeInput,
  MutationDeltaInput,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationTreeSubtreeSnapshot,
} from '../../write'
import type {
  MutationEffect,
  MutationEffectProgram,
  MutationEntityRef,
} from './effect'

export interface MutationEffectBuilder<
  Tag extends string = string
> {
  entity: {
    create(
      entity: MutationEntityRef,
      value: unknown,
      tags?: readonly Tag[]
    ): void
    patch(
      entity: MutationEntityRef,
      writes: Readonly<Record<string, unknown>>,
      tags?: readonly Tag[]
    ): void
    patchMany(
      table: string,
      updates: readonly {
        id: string
        writes: Readonly<Record<string, unknown>>
      }[],
      tags?: readonly Tag[]
    ): void
    delete(entity: MutationEntityRef, tags?: readonly Tag[]): void
  }
  structure: {
    ordered: {
      insert(
        structure: string,
        itemId: string,
        value: unknown,
        to: MutationOrderedAnchor,
        tags?: readonly Tag[]
      ): void
      move(
        structure: string,
        itemId: string,
        to: MutationOrderedAnchor,
        tags?: readonly Tag[]
      ): void
      splice(
        structure: string,
        itemIds: readonly string[],
        to: MutationOrderedAnchor,
        tags?: readonly Tag[]
      ): void
      delete(
        structure: string,
        itemId: string,
        tags?: readonly Tag[]
      ): void
      patch(
        structure: string,
        itemId: string,
        patch: unknown,
        tags?: readonly Tag[]
      ): void
    }
    tree: {
      insert(
        structure: string,
        nodeId: string,
        parentId?: string,
        index?: number,
        value?: unknown,
        tags?: readonly Tag[]
      ): void
      move(
        structure: string,
        nodeId: string,
        parentId?: string,
        index?: number,
        tags?: readonly Tag[]
      ): void
      delete(
        structure: string,
        nodeId: string,
        tags?: readonly Tag[]
      ): void
      restore(
        structure: string,
        snapshot: MutationTreeSubtreeSnapshot,
        tags?: readonly Tag[]
      ): void
      patch(
        structure: string,
        nodeId: string,
        patch: unknown,
        tags?: readonly Tag[]
      ): void
    }
  }
  semantic: {
    tag(value: Tag): void
    change(key: string, change?: MutationChangeInput): void
    footprint(footprint: readonly MutationFootprint[]): void
  }
  build(): MutationEffectProgram<Tag>
}

export const createMutationEffectBuilder = <
  Tag extends string = string
>(): MutationEffectBuilder<Tag> => {
  const effects: MutationEffect<Tag>[] = []

  return {
    entity: {
      create: (entity, value, tags) => {
        effects.push({
          type: 'entity.create',
          entity,
          value,
          ...(tags === undefined ? {} : { tags })
        })
      },
      patch: (entity, writes, tags) => {
        effects.push({
          type: 'entity.patch',
          entity,
          writes,
          ...(tags === undefined ? {} : { tags })
        })
      },
      patchMany: (table, updates, tags) => {
        effects.push({
          type: 'entity.patchMany',
          table,
          updates,
          ...(tags === undefined ? {} : { tags })
        })
      },
      delete: (entity, tags) => {
        effects.push({
          type: 'entity.delete',
          entity,
          ...(tags === undefined ? {} : { tags })
        })
      }
    },
    structure: {
      ordered: {
        insert: (structure, itemId, value, to, tags) => {
          effects.push({
            type: 'ordered.insert',
            structure,
            itemId,
            value,
            to,
            ...(tags === undefined ? {} : { tags })
          })
        },
        move: (structure, itemId, to, tags) => {
          effects.push({
            type: 'ordered.move',
            structure,
            itemId,
            to,
            ...(tags === undefined ? {} : { tags })
          })
        },
        splice: (structure, itemIds, to, tags) => {
          effects.push({
            type: 'ordered.splice',
            structure,
            itemIds,
            to,
            ...(tags === undefined ? {} : { tags })
          })
        },
        delete: (structure, itemId, tags) => {
          effects.push({
            type: 'ordered.delete',
            structure,
            itemId,
            ...(tags === undefined ? {} : { tags })
          })
        },
        patch: (structure, itemId, patch, tags) => {
          effects.push({
            type: 'ordered.patch',
            structure,
            itemId,
            patch,
            ...(tags === undefined ? {} : { tags })
          })
        }
      },
      tree: {
        insert: (structure, nodeId, parentId, index, value, tags) => {
          effects.push({
            type: 'tree.insert',
            structure,
            nodeId,
            ...(parentId === undefined ? {} : { parentId }),
            ...(index === undefined ? {} : { index }),
            ...(value === undefined ? {} : { value }),
            ...(tags === undefined ? {} : { tags })
          })
        },
        move: (structure, nodeId, parentId, index, tags) => {
          effects.push({
            type: 'tree.move',
            structure,
            nodeId,
            ...(parentId === undefined ? {} : { parentId }),
            ...(index === undefined ? {} : { index }),
            ...(tags === undefined ? {} : { tags })
          })
        },
        delete: (structure, nodeId, tags) => {
          effects.push({
            type: 'tree.delete',
            structure,
            nodeId,
            ...(tags === undefined ? {} : { tags })
          })
        },
        restore: (structure, snapshot, tags) => {
          effects.push({
            type: 'tree.restore',
            structure,
            snapshot,
            ...(tags === undefined ? {} : { tags })
          })
        },
        patch: (structure, nodeId, patch, tags) => {
          effects.push({
            type: 'tree.node.patch',
            structure,
            nodeId,
            patch,
            ...(tags === undefined ? {} : { tags })
          })
        }
      }
    },
    semantic: {
      tag: (value) => {
        effects.push({
          type: 'semantic.tag',
          value
        })
      },
      change: (key, change) => {
        effects.push({
          type: 'semantic.change',
          key,
          ...(change === undefined ? {} : { change })
        })
      },
      footprint: (footprint) => {
        effects.push({
          type: 'semantic.footprint',
          footprint
        })
      }
    },
    build: () => ({
      effects: [...effects]
    })
  }
}
