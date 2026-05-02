import type {
  MutationOrderedAnchor,
  MutationTreeSubtreeSnapshot,
} from '../../write'
import type {
  MutationProgram,
  MutationProgramStep,
  MutationEntityRef,
  MutationOrderedTarget,
  MutationTreeTarget,
} from './program'

export interface MutationProgramWriter<
> {
  entity: {
    create(
      entity: MutationEntityRef,
      value: unknown
    ): void
    patch(
      entity: MutationEntityRef,
      writes: Readonly<Record<string, unknown>>
    ): void
    delete(
      entity: MutationEntityRef
    ): void
  }
  ordered: {
    insert(
      target: MutationOrderedTarget,
      itemId: string,
      value: unknown,
      to: MutationOrderedAnchor
    ): void
    move(
      target: MutationOrderedTarget,
      itemId: string,
      to: MutationOrderedAnchor
    ): void
    splice(
      target: MutationOrderedTarget,
      itemIds: readonly string[],
      to: MutationOrderedAnchor
    ): void
    delete(
      target: MutationOrderedTarget,
      itemId: string
    ): void
    patch(
      target: MutationOrderedTarget,
      itemId: string,
      patch: unknown
    ): void
  }
  tree: {
    insert(
      target: MutationTreeTarget,
      nodeId: string,
      parentId?: string,
      index?: number,
      value?: unknown
    ): void
    move(
      target: MutationTreeTarget,
      nodeId: string,
      parentId?: string,
      index?: number
    ): void
    delete(
      target: MutationTreeTarget,
      nodeId: string
    ): void
    restore(
      target: MutationTreeTarget,
      snapshot: MutationTreeSubtreeSnapshot
    ): void
    patch(
      target: MutationTreeTarget,
      nodeId: string,
      patch: unknown
    ): void
  }
  build(): MutationProgram
}

export const createMutationProgramWriter = (): MutationProgramWriter => {
  const steps: MutationProgramStep[] = []

  return {
    entity: {
      create: (entity, value) => {
        steps.push({
          type: 'entity.create',
          entity,
          value
        })
      },
      patch: (entity, writes) => {
        steps.push({
          type: 'entity.patch',
          entity,
          writes
        })
      },
      delete: (entity) => {
        steps.push({
          type: 'entity.delete',
          entity
        })
      }
    },
    ordered: {
      insert: (target, itemId, value, to) => {
        steps.push({
          type: 'ordered.insert',
          target,
          itemId,
          value,
          to
        })
      },
      move: (target, itemId, to) => {
        steps.push({
          type: 'ordered.move',
          target,
          itemId,
          to
        })
      },
      splice: (target, itemIds, to) => {
        steps.push({
          type: 'ordered.splice',
          target,
          itemIds,
          to
        })
      },
      delete: (target, itemId) => {
        steps.push({
          type: 'ordered.delete',
          target,
          itemId
        })
      },
      patch: (target, itemId, patch) => {
        steps.push({
          type: 'ordered.patch',
          target,
          itemId,
          patch
        })
      }
    },
    tree: {
      insert: (target, nodeId, parentId, index, value) => {
        steps.push({
          type: 'tree.insert',
          target,
          nodeId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(index === undefined ? {} : { index }),
          ...(value === undefined ? {} : { value })
        })
      },
      move: (target, nodeId, parentId, index) => {
        steps.push({
          type: 'tree.move',
          target,
          nodeId,
          ...(parentId === undefined ? {} : { parentId }),
          ...(index === undefined ? {} : { index })
        })
      },
      delete: (target, nodeId) => {
        steps.push({
          type: 'tree.delete',
          target,
          nodeId
        })
      },
      restore: (target, snapshot) => {
        steps.push({
          type: 'tree.restore',
          target,
          snapshot
        })
      },
      patch: (target, nodeId, patch) => {
        steps.push({
          type: 'tree.node.patch',
          target,
          nodeId,
          patch
        })
      }
    },
    build: () => ({
      steps: [...steps]
    })
  }
}
