import type {
  AppearanceId,
  AppearanceList
} from '@dataview/engine/projection/view'
import type {
  ValueStore
} from '@shared/store'

export interface Selection {
  ids: readonly AppearanceId[]
  anchor?: AppearanceId
  focus?: AppearanceId
}

export interface SelectionStore extends ValueStore<Selection> { }

export interface SelectionApi {
  store: SelectionStore
  get(): Selection
  clear(): void
  all(): void
  set(
    ids: readonly AppearanceId[],
    options?: {
      anchor?: AppearanceId
      focus?: AppearanceId
    }
  ): void
  toggle(ids: readonly AppearanceId[]): void
  extend(to: AppearanceId): void
}

export interface SelectionScope {
  appearances: () => AppearanceList | undefined
}
