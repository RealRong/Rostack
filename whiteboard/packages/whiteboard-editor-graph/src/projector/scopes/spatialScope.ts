export interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

export const createSpatialPatchScope = (
  input: Partial<SpatialPatchScope> = {}
): SpatialPatchScope => ({
  reset: input.reset ?? false,
  graph: input.graph ?? false
})

export const normalizeSpatialPatchScope = (
  scope: SpatialPatchScope | undefined
): SpatialPatchScope => createSpatialPatchScope(scope)

export const mergeSpatialPatchScope = (
  current: SpatialPatchScope | undefined,
  next: SpatialPatchScope
): SpatialPatchScope => createSpatialPatchScope({
  reset: (current?.reset ?? false) || next.reset,
  graph: (current?.graph ?? false) || next.graph
})

export const hasSpatialPatchScope = (
  scope: SpatialPatchScope | undefined
): boolean => Boolean(
  scope?.reset
  || scope?.graph
)
