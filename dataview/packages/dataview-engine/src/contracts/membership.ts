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

export interface MembershipNodeState {
  key: SectionKey
  label: Token
  color?: string
  bucket?: SectionBucket
  recordIds: readonly RecordId[]
}

export interface MembershipState {
  order: readonly SectionKey[]
  byKey: ReadonlyMap<SectionKey, MembershipNodeState>
  keysByRecord: ReadonlyMap<RecordId, readonly SectionKey[]>
}

export interface MembershipRecordChange {
  before: readonly SectionKey[]
  after: readonly SectionKey[]
}

export interface MembershipDelta {
  rebuild: boolean
  orderChanged: boolean
  removed: readonly SectionKey[]
  changed: readonly SectionKey[]
  records: ReadonlyMap<RecordId, MembershipRecordChange>
}

export interface MembershipRuntimeState {
  structure: MembershipState
  projection: ItemProjectionCache
}

export const emptyMembershipState = (): MembershipState => ({
  order: [],
  byKey: new Map(),
  keysByRecord: new Map()
})

export const emptyMembershipRuntimeState = (): MembershipRuntimeState => ({
  structure: emptyMembershipState(),
  projection: emptyItemProjectionCache()
})
