import type {
  MutationEntitySpec,
  MutationStructureSource,
} from './contracts'

export interface MutationRegistry<
  Doc
> {
  entities?: Readonly<Record<string, MutationEntitySpec>>
  structures?: MutationStructureSource<Doc>
}

export const defineMutationRegistry = <
  Doc
>() => <
  const TRegistry extends MutationRegistry<Doc>
>(
  registry: TRegistry
): TRegistry => registry
