import type {
  MutationEntitySpec,
  MutationStructureChangeSpec,
} from './contracts'
import type {
  MutationTreeSnapshot,
} from '../write'

export interface MutationEntityTarget {
  kind: 'entity'
  type: string
  id: string
}

export interface MutationOrderedTarget {
  kind: 'ordered'
  type: string
  key?: string
}

export interface MutationTreeTarget {
  kind: 'tree'
  type: string
  key?: string
}

export type MutationTarget =
  | MutationEntityTarget
  | MutationOrderedTarget
  | MutationTreeTarget

export interface MutationEntityRegistrySpec extends MutationEntitySpec {
  type?: string
}

export interface MutationOrderedRegistrySpec<
  Doc,
  Item = unknown,
  Patch = unknown
> {
  type?: string
  read(document: Doc, key: string | undefined): readonly Item[]
  write(document: Doc, key: string | undefined, items: readonly Item[]): Doc
  identify(item: Item): string
  clone?(item: Item): Item
  patch?(item: Item, patch: Patch): Item
  diff?(before: Item, after: Item): Patch
  change?: readonly MutationStructureChangeSpec[] | ((
    key: string | undefined
  ) => readonly MutationStructureChangeSpec[] | undefined)
}

export interface MutationTreeRegistrySpec<
  Doc,
  Value = unknown,
  Patch = unknown
> {
  type?: string
  read(document: Doc, key: string | undefined): MutationTreeSnapshot<Value>
  write(document: Doc, key: string | undefined, tree: MutationTreeSnapshot<Value>): Doc
  clone?(value: Value): Value
  patch?(value: Value, patch: Patch): Value
  diff?(before: Value, after: Value): Patch
  change?: readonly MutationStructureChangeSpec[] | ((
    key: string | undefined
  ) => readonly MutationStructureChangeSpec[] | undefined)
}

export interface MutationRegistry<
  Doc
> {
  entity?: Readonly<Record<string, MutationEntityRegistrySpec>>
  ordered?: Readonly<Record<string, MutationOrderedRegistrySpec<Doc, unknown, unknown>>>
  tree?: Readonly<Record<string, MutationTreeRegistrySpec<Doc, unknown, unknown>>>
}

export const defineMutationRegistry = <
  Doc
>() => <
  const TRegistry extends MutationRegistry<Doc>
>(
  registry: TRegistry
): TRegistry => registry

export const readEntityTargetType = (
  key: string,
  spec: MutationEntityRegistrySpec
): string => spec.type ?? key

export const readOrderedTargetType = (
  key: string,
  spec: MutationOrderedRegistrySpec<unknown, unknown, unknown>
): string => spec.type ?? key

export const readTreeTargetType = (
  key: string,
  spec: MutationTreeRegistrySpec<unknown, unknown, unknown>
): string => spec.type ?? key

export const serializeMutationTarget = (
  target: MutationOrderedTarget | MutationTreeTarget
): string => target.key === undefined
  ? target.type
  : `${target.type}:${target.key}`
