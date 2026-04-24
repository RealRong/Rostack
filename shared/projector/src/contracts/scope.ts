export type PhaseScopeMap<TPhaseName extends string> = {
  [K in TPhaseName]: unknown
}

export type DefaultPhaseScopeMap<TPhaseName extends string> = {
  [K in TPhaseName]: undefined
}

export type PhaseScopeInput<
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName>
> = Partial<{
  [K in TPhaseName]: TScopeMap[K]
}>
