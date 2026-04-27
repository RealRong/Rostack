import {
  clear,
  cloneGroupState,
  normalizeGroupState,
  patch,
  patchBucket,
  sameGroupState,
  set,
  toggle,
  toggleGroupBucketCollapsed,
  type ViewGroupPatch
} from './groupState'
import { group as groupWrite, type GroupWriteResult } from './groupWrite'

export const group = {
  state: {
    clone: cloneGroupState,
    normalize: normalizeGroupState,
    same: sameGroupState
  },
  clear,
  set,
  toggle,
  patch,
  bucket: {
    patch: patchBucket,
    toggleCollapsed: toggleGroupBucketCollapsed
  },
  write: {
    value: groupWrite.write.value
  }
} as const

export type {
  GroupWriteResult,
  ViewGroupPatch
}
