import type {
  MutationDeltaInput,
  MutationFootprint,
  MutationOrderedAnchor,
} from '../write'
import type {
  MutationRegistry,
  MutationEntityRegistrySpec,
  MutationOrderedRegistrySpec,
  MutationTreeRegistrySpec,
  MutationEntityTarget,
  MutationOrderedTarget,
  MutationTreeTarget,
} from './registry'
import {
  readEntityTargetType,
  readOrderedTargetType,
  readTreeTargetType,
} from './registry'
import type {
  MutationProgramWriter,
} from './program/writer'

type MutationTags<Tag extends string> = readonly Tag[] | undefined
type MutationMetadata = {
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
}

type EntityPortForSpec<
  Spec,
  Tag extends string
> = Spec extends {
  kind: 'singleton'
}
  ? {
      create(value: unknown, tags?: MutationTags<Tag>, metadata?: MutationMetadata): void
      patch(writes: Readonly<Record<string, unknown>>, tags?: MutationTags<Tag>, metadata?: MutationMetadata): void
      delete(tags?: MutationTags<Tag>, metadata?: MutationMetadata): void
    }
  : {
      create(value: unknown, tags?: MutationTags<Tag>, metadata?: MutationMetadata): void
      patch(id: string, writes: Readonly<Record<string, unknown>>, tags?: MutationTags<Tag>, metadata?: MutationMetadata): void
      patchMany(
        updates: readonly {
          id: string
          writes: Readonly<Record<string, unknown>>
        }[],
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ): void
      delete(id: string, tags?: MutationTags<Tag>, metadata?: MutationMetadata): void
    }

type OrderedPort<Tag extends string> = (
  key?: string
) => {
  insert(
    value: unknown,
    to?: MutationOrderedAnchor,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  move(
    itemId: string,
    to?: MutationOrderedAnchor,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  splice(
    itemIds: readonly string[],
    to?: MutationOrderedAnchor,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  patch(
    itemId: string,
    patch: unknown,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  delete(
    itemId: string,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
}

type TreePort<Tag extends string> = (
  key?: string
) => {
  insert(
    nodeId: string,
    parentId?: string,
    index?: number,
    value?: unknown,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  move(
    nodeId: string,
    parentId?: string,
    index?: number,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  delete(
    nodeId: string,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  restore(
    snapshot: import('../write').MutationTreeSubtreeSnapshot,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
  patch(
    nodeId: string,
    patch: unknown,
    tags?: MutationTags<Tag>,
    metadata?: MutationMetadata
  ): void
}

export type MutationPorts<
  TRegistry extends MutationRegistry<any>,
  Tag extends string = string
> = (
  (TRegistry['entity'] extends Readonly<Record<string, infer TSpec>>
    ? {
        [K in keyof TRegistry['entity'] & string]: EntityPortForSpec<TRegistry['entity'][K], Tag>
      }
    : {}) &
  (TRegistry['ordered'] extends Readonly<Record<string, infer _>>
    ? {
        [K in keyof TRegistry['ordered'] & string]: OrderedPort<Tag>
      }
    : {}) &
  (TRegistry['tree'] extends Readonly<Record<string, infer _>>
    ? {
        [K in keyof TRegistry['tree'] & string]: TreePort<Tag>
      }
    : {}) & {
      signal(delta: MutationDeltaInput, tags?: MutationTags<Tag>): void
    }
)

const readEntityIdFromValue = (
  type: string,
  value: unknown
): string => {
  if (
    typeof value !== 'object'
    || value === null
    || typeof (value as {
      id?: unknown
    }).id !== 'string'
    || (value as {
      id: string
    }).id.length === 0
  ) {
    throw new Error(`Mutation port "${type}.create" requires value.id.`)
  }

  return (value as {
    id: string
  }).id
}

const readOrderedAnchor = (
  anchor: MutationOrderedAnchor | undefined
): MutationOrderedAnchor => anchor ?? {
  kind: 'end'
}

const createEntityTarget = (
  type: string,
  id: string
): MutationEntityTarget => ({
  kind: 'entity',
  type,
  id
})

const createOrderedTarget = (
  type: string,
  key: string | undefined
): MutationOrderedTarget => ({
  kind: 'ordered',
  type,
  ...(key === undefined ? {} : { key })
})

const createTreeTarget = (
  type: string,
  key: string | undefined
): MutationTreeTarget => ({
  kind: 'tree',
  type,
  ...(key === undefined ? {} : { key })
})

export const createMutationPorts = <
  Doc,
  const TRegistry extends MutationRegistry<Doc>,
  Tag extends string = string
>(
  registry: TRegistry,
  writer: MutationProgramWriter<Tag>
): MutationPorts<TRegistry, Tag> => {
  const ports: Record<string, unknown> = {}

  Object.entries(registry.entity ?? {}).forEach(([name, rawSpec]) => {
    const spec = rawSpec as MutationEntityRegistrySpec
    const type = readEntityTargetType(name, spec)
    if (spec.kind === 'singleton') {
      ports[name] = {
        create: (value: unknown, tags?: MutationTags<Tag>, metadata?: MutationMetadata) => {
          writer.entity.create(createEntityTarget(type, type), value, tags, metadata)
        },
        patch: (writes: Readonly<Record<string, unknown>>, tags?: MutationTags<Tag>, metadata?: MutationMetadata) => {
          writer.entity.patch(createEntityTarget(type, type), writes, tags, metadata)
        },
        delete: (tags?: MutationTags<Tag>, metadata?: MutationMetadata) => {
          writer.entity.delete(createEntityTarget(type, type), tags, metadata)
        }
      }
      return
    }

    ports[name] = {
      create: (value: unknown, tags?: MutationTags<Tag>, metadata?: MutationMetadata) => {
        writer.entity.create(
          createEntityTarget(type, readEntityIdFromValue(type, value)),
          value,
          tags,
          metadata
        )
      },
      patch: (
        id: string,
        writes: Readonly<Record<string, unknown>>,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.entity.patch(createEntityTarget(type, id), writes, tags, metadata)
      },
      patchMany: (
        updates: readonly {
          id: string
          writes: Readonly<Record<string, unknown>>
        }[],
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.entity.patchMany(type, updates, tags, metadata)
      },
      delete: (id: string, tags?: MutationTags<Tag>, metadata?: MutationMetadata) => {
        writer.entity.delete(createEntityTarget(type, id), tags, metadata)
      }
    }
  })

  Object.entries(registry.ordered ?? {}).forEach(([name, rawSpec]) => {
    const spec = rawSpec as MutationOrderedRegistrySpec<Doc, unknown, unknown>
    const type = readOrderedTargetType(name, spec)
    ports[name] = (key?: string) => ({
      insert: (
        value: unknown,
        to?: MutationOrderedAnchor,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.ordered.insert(
          createOrderedTarget(type, key),
          spec.identify(value as never),
          value,
          readOrderedAnchor(to),
          tags,
          metadata
        )
      },
      move: (
        itemId: string,
        to?: MutationOrderedAnchor,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.ordered.move(
          createOrderedTarget(type, key),
          itemId,
          readOrderedAnchor(to),
          tags,
          metadata
        )
      },
      splice: (
        itemIds: readonly string[],
        to?: MutationOrderedAnchor,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.ordered.splice(
          createOrderedTarget(type, key),
          itemIds,
          readOrderedAnchor(to),
          tags,
          metadata
        )
      },
      patch: (
        itemId: string,
        patch: unknown,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.ordered.patch(
          createOrderedTarget(type, key),
          itemId,
          patch,
          tags,
          metadata
        )
      },
      delete: (
        itemId: string,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.ordered.delete(
          createOrderedTarget(type, key),
          itemId,
          tags,
          metadata
        )
      }
    })
  })

  Object.entries(registry.tree ?? {}).forEach(([name, rawSpec]) => {
    const spec = rawSpec as MutationTreeRegistrySpec<Doc, unknown, unknown>
    const type = readTreeTargetType(name, spec)
    ports[name] = (key?: string) => ({
      insert: (
        nodeId: string,
        parentId?: string,
        index?: number,
        value?: unknown,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.tree.insert(
          createTreeTarget(type, key),
          nodeId,
          parentId,
          index,
          value,
          tags,
          metadata
        )
      },
      move: (
        nodeId: string,
        parentId?: string,
        index?: number,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.tree.move(
          createTreeTarget(type, key),
          nodeId,
          parentId,
          index,
          tags,
          metadata
        )
      },
      delete: (
        nodeId: string,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.tree.delete(
          createTreeTarget(type, key),
          nodeId,
          tags,
          metadata
        )
      },
      restore: (
        snapshot: import('../write').MutationTreeSubtreeSnapshot,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.tree.restore(
          createTreeTarget(type, key),
          snapshot,
          tags,
          metadata
        )
      },
      patch: (
        nodeId: string,
        patch: unknown,
        tags?: MutationTags<Tag>,
        metadata?: MutationMetadata
      ) => {
        writer.tree.patch(
          createTreeTarget(type, key),
          nodeId,
          patch,
          tags,
          metadata
        )
      }
    })
  })

  ports.signal = (
    delta: MutationDeltaInput,
    tags?: MutationTags<Tag>
  ) => {
    writer.signal(delta, tags)
  }

  return ports as MutationPorts<TRegistry, Tag>
}
