import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Token
} from '@shared/i18n'
import type {
  SectionBucket,
  SectionKey
} from '@dataview/engine/contracts/shared'
import type {
  ItemProjectionCache
} from '@dataview/engine/active/shared/itemIdentity'
import {
  emptyItemProjectionCache
} from '@dataview/engine/active/shared/itemIdentity'

export type { ItemProjectionCache } from '@dataview/engine/active/shared/itemIdentity'

export interface SectionNodeState {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  collapsed: boolean
  recordIds: readonly RecordId[]
  visible: boolean
}

export interface SectionState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, SectionNodeState>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface SectionDelta {
  rebuild: boolean
  orderChanged: boolean
  removed: readonly SectionKey[]
  changed: readonly SectionKey[]
}

export interface SectionRuntimeState {
  structure: SectionState
  projection: ItemProjectionCache
}

export const emptySectionState = (): SectionState => ({
  order: [],
  byKey: new Map(),
  keysByRecord: new Map()
})

export const emptySectionRuntimeState = (): SectionRuntimeState => ({
  structure: emptySectionState(),
  projection: emptyItemProjectionCache()
})
