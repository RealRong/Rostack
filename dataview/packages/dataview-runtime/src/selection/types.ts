import type {
  ItemId
} from '@dataview/engine'
import { store } from '@shared/core'


export type SelectionSummary =
  | 'none'
  | 'some'
  | 'all'

export type SelectionApplyMode =
  | 'replace'
  | 'add'
  | 'remove'
  | 'toggle'

export interface OrderedSelectionDomain<TId> {
  count: number
  has(id: TId): boolean
  indexOf(id: TId): number | undefined
  at(index: number): TId | undefined
  prev(id: TId): TId | undefined
  next(id: TId): TId | undefined
  range(anchor: TId, focus: TId): readonly TId[]
  iterate(): Iterable<TId>
}

export interface SelectionScope<TId> {
  key: string
  revision: unknown
  count: number
  has(id: TId): boolean
  iterate(): Iterable<TId>
}

export type SelectionShape<TId> =
  | {
      kind: 'empty'
    }
  | {
      kind: 'include'
      ids: ReadonlySet<TId>
    }
  | {
      kind: 'exclude'
      ids: ReadonlySet<TId>
    }

export interface SelectionSnapshot<TId> {
  shape: SelectionShape<TId>
  anchor?: TId
  focus?: TId
  selectedCount: number
  domainRevision: number
}

export interface SelectionCommandApi<TId> {
  restore(snapshot: SelectionSnapshot<TId>): void
  clear(): void
  selectAll(): void
  applyIds(
    mode: SelectionApplyMode,
    ids: Iterable<TId>,
    options?: {
      anchor?: TId
      focus?: TId
    }
  ): void
  applyScope(
    mode: SelectionApplyMode,
    scope: SelectionScope<TId>,
    options?: {
      anchor?: TId
      focus?: TId
    }
  ): void
  range: {
    extendTo(id: TId): void
    step(
      delta: number,
      options?: {
        extend?: boolean
      }
    ): boolean
  }
}

export interface SelectionQueryApi<TId> {
  contains(id: TId): boolean
  count(scope?: SelectionScope<TId>): number
  summary(scope?: SelectionScope<TId>): SelectionSummary
}

export interface SelectionEnumerateApi<TId> {
  iterate(scope?: SelectionScope<TId>): Iterable<TId>
  materialize(scope?: SelectionScope<TId>): readonly TId[]
}

export interface SelectionController<TId> {
  state: {
    store: store.ReadStore<SelectionSnapshot<TId>>
    getSnapshot(): SelectionSnapshot<TId>
    subscribe(listener: () => void): () => void
  }
  command: SelectionCommandApi<TId>
  query: SelectionQueryApi<TId>
  enumerate: SelectionEnumerateApi<TId>
  store: {
    membership: store.KeyedReadStore<TId, boolean>
    scopeSummary: store.KeyedReadStore<SelectionScope<TId>, SelectionSummary>
  }
}

export interface SelectionDomainSource<TId> {
  get(): OrderedSelectionDomain<TId> | undefined
  subscribe(listener: () => void): () => void
}

export interface SelectionControllerInstance<TId> {
  controller: SelectionController<TId>
  dispose(): void
}

export type ItemSelectionSnapshot = SelectionSnapshot<ItemId>
export type ItemSelectionController = SelectionController<ItemId>
