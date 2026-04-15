import {
  clear,
  cloneBucketState,
  cloneBuckets,
  cloneGroup,
  normalizeGroup,
  sameGroup,
  set,
  setBucketCollapsed,
  setBucketHidden,
  setInterval,
  setMode,
  setShowEmpty,
  setSort,
  toggle,
  toggleBucketCollapsed,
  type ViewGroupPatch
} from '@dataview/core/group/state'
import { group as groupWrite } from '@dataview/core/group/write'

export const group = {
  clear,
  set,
  toggle,
  setMode,
  setSort,
  setInterval,
  setShowEmpty,
  setBucketHidden,
  setBucketCollapsed,
  toggleBucketCollapsed,
  write: groupWrite.write
} as const

export {
  cloneBucketState,
  cloneBuckets,
  cloneGroup,
  normalizeGroup,
  sameGroup,
  type ViewGroupPatch
}
export type {
  GroupWriteResult
} from '@dataview/core/group/write'
