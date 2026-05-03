export const MUTATION_NODE = Symbol('mutation.node')
export const MUTATION_SCHEMA = Symbol('mutation.schema')
export const MUTATION_OPTIONAL = Symbol('mutation.optional')
export const MUTATION_TYPE = Symbol('mutation.type')

export type MutationTreeNodeSnapshot<TValue = unknown> = {
  parentId?: string
  children: readonly string[]
  value?: TValue
}

export type MutationTreeSnapshot<TValue = unknown> = {
  rootId?: string
  nodes: Readonly<Record<string, MutationTreeNodeSnapshot<TValue>>>
}

export type MutationSequenceAnchor =
  | {
      before: string
    }
  | {
      after: string
    }
  | {
      at: 'start' | 'end'
    }

export type MutationTreeInsertInput<TValue> = {
  parentId?: string
  index?: number
  value?: TValue
}

export type MutationTreeMoveInput = {
  parentId?: string
  index?: number
}

export type MutationAccessOverride<TValue> = {
  read(document: unknown, targetId?: string): TValue
  write(document: unknown, value: TValue, targetId?: string): unknown
}

export type MutationSequenceConfig<TItem> = {
  keyOf(item: TItem): string
}
