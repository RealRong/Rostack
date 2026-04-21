import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  Token
} from '@shared/i18n'
import type {
  Partition
} from '@dataview/engine/active/shared/partition'
import {
  EMPTY_PARTITION
} from '@dataview/engine/active/shared/partition'
import type {
  SectionBucket,
  SectionKey
} from '@dataview/engine/contracts/shared'

export interface MembershipMetaState {
  label: Token
  color?: string
  bucket?: SectionBucket
}

export interface MembershipState {
  sections: Partition<SectionKey>
  meta: ReadonlyMap<SectionKey, MembershipMetaState>
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

export const emptyMembershipState = (): MembershipState => ({
  sections: EMPTY_PARTITION,
  meta: new Map()
})
