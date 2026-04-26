import { idDelta, type IdDelta } from '../delta/idDelta'

type ChangeFlagField = {
  kind: 'flag'
}

type ChangeIdsField<TId extends string> = {
  kind: 'ids'
  __id?: TId
}

type ChangeSetField<TValue> = {
  kind: 'set'
  __value?: TValue
}

type ChangeLeafField =
  | ChangeFlagField
  | ChangeIdsField<string>
  | ChangeSetField<unknown>

export interface ChangeObjectFields {
  [key: string]: ChangeField
}

export type ChangeField =
  | ChangeLeafField
  | ChangeObjectFields

export type ChangeSpec<TFields extends ChangeObjectFields> = TFields

export type InferChangeState<TField extends ChangeField> =
  TField extends ChangeFlagField
    ? boolean
    : TField extends ChangeIdsField<infer TId>
      ? IdDelta<TId>
      : TField extends ChangeSetField<infer TValue>
        ? ReadonlySet<TValue>
        : TField extends ChangeObjectFields
          ? {
              [TKey in keyof TField]: InferChangeState<TField[TKey]>
            }
          : never

export type {
  ChangeFlagField,
  ChangeIdsField,
  ChangeSetField
}

const isLeafField = (
  field: ChangeField
): field is ChangeLeafField => (
  typeof field === 'object'
  && field !== null
  && 'kind' in field
)

const cloneIds = <TId extends string>(
  delta: IdDelta<TId>
): IdDelta<TId> => ({
  added: new Set(delta.added),
  updated: new Set(delta.updated),
  removed: new Set(delta.removed)
})

const mergeIds = <TId extends string>(
  target: IdDelta<TId>,
  source: IdDelta<TId>
) => {
  source.added.forEach((id) => {
    target.added.add(id)
  })
  source.updated.forEach((id) => {
    target.updated.add(id)
  })
  source.removed.forEach((id) => {
    target.removed.add(id)
  })
}

const hasIds = <TId extends string>(
  delta: IdDelta<TId>
): boolean => (
  delta.added.size > 0
  || delta.updated.size > 0
  || delta.removed.size > 0
)

const createFieldState = (
  field: ChangeField
): unknown => {
  if (isLeafField(field)) {
    switch (field.kind) {
      case 'flag':
        return false
      case 'ids':
        return idDelta.create<string>()
      case 'set':
        return new Set()
    }
  }

  const next: Record<string, unknown> = {}
  Object.entries(field).forEach(([key, child]) => {
    next[key] = createFieldState(child)
  })
  return next
}

const cloneFieldState = (
  field: ChangeField,
  state: unknown
): unknown => {
  if (isLeafField(field)) {
    switch (field.kind) {
      case 'flag':
        return state
      case 'ids':
        return cloneIds(state as IdDelta<string>)
      case 'set':
        return new Set(state as ReadonlySet<unknown>)
    }
  }

  const current = state as Record<string, unknown>
  const next: Record<string, unknown> = {}
  Object.entries(field).forEach(([key, child]) => {
    next[key] = cloneFieldState(child, current[key])
  })
  return next
}

const resetFieldState = (
  field: ChangeField,
  state: unknown
) => {
  if (isLeafField(field)) {
    switch (field.kind) {
      case 'flag':
        return false
      case 'ids':
        idDelta.reset(state as IdDelta<string>)
        return state
      case 'set':
        ;(state as Set<unknown>).clear()
        return state
    }
  }

  const current = state as Record<string, unknown>
  Object.entries(field).forEach(([key, child]) => {
    const next = resetFieldState(child, current[key])
    if (isLeafField(child) && child.kind === 'flag') {
      current[key] = next
    }
  })

  return state
}

const mergeFieldState = (
  field: ChangeField,
  target: unknown,
  source: unknown
) => {
  if (isLeafField(field)) {
    switch (field.kind) {
      case 'flag':
        return Boolean(target) || Boolean(source)
      case 'ids':
        mergeIds(
          target as IdDelta<string>,
          source as IdDelta<string>
        )
        return target
      case 'set':
        ;(source as ReadonlySet<unknown>).forEach((value) => {
          ;(target as Set<unknown>).add(value)
        })
        return target
    }
  }

  const currentTarget = target as Record<string, unknown>
  const currentSource = source as Record<string, unknown>
  Object.entries(field).forEach(([key, child]) => {
    const next = mergeFieldState(
      child,
      currentTarget[key],
      currentSource[key]
    )
    if (isLeafField(child) && child.kind === 'flag') {
      currentTarget[key] = next
    }
  })
  return target
}

const hasFieldState = (
  field: ChangeField,
  state: unknown
): boolean => {
  if (isLeafField(field)) {
    switch (field.kind) {
      case 'flag':
        return Boolean(state)
      case 'ids':
        return hasIds(state as IdDelta<string>)
      case 'set':
        return (state as ReadonlySet<unknown>).size > 0
    }
  }

  return Object.entries(field).some(([key, child]) => (
    hasFieldState(child, (state as Record<string, unknown>)[key])
  ))
}

export const flag = (): ChangeFlagField => ({
  kind: 'flag'
})

export const ids = <TId extends string>(): ChangeIdsField<TId> => ({
  kind: 'ids'
})

export const set = <TValue,>(): ChangeSetField<TValue> => ({
  kind: 'set'
})

export const defineChangeSpec = <TFields extends ChangeObjectFields>(
  fields: TFields
): ChangeSpec<TFields> => fields

export const createChangeState = <TFields extends ChangeObjectFields>(
  spec: ChangeSpec<TFields>
): InferChangeState<ChangeSpec<TFields>> => createFieldState(spec) as InferChangeState<ChangeSpec<TFields>>

export const cloneChangeState = <TFields extends ChangeObjectFields>(
  spec: ChangeSpec<TFields>,
  state: InferChangeState<ChangeSpec<TFields>>
): InferChangeState<ChangeSpec<TFields>> => cloneFieldState(spec, state) as InferChangeState<ChangeSpec<TFields>>

export const mergeChangeState = <TFields extends ChangeObjectFields>(
  spec: ChangeSpec<TFields>,
  target: InferChangeState<ChangeSpec<TFields>>,
  source: InferChangeState<ChangeSpec<TFields>>
) => {
  mergeFieldState(spec, target, source)
}

export const takeChangeState = <TFields extends ChangeObjectFields>(
  spec: ChangeSpec<TFields>,
  state: InferChangeState<ChangeSpec<TFields>>
): InferChangeState<ChangeSpec<TFields>> => {
  const current = cloneChangeState(spec, state)
  resetFieldState(spec, state)
  return current
}

export const hasChangeState = <TFields extends ChangeObjectFields>(
  spec: ChangeSpec<TFields>,
  state: InferChangeState<ChangeSpec<TFields>>
): boolean => hasFieldState(spec, state)
