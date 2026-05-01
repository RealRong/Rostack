import {
  clear,
  cloneGroupState,
  normalizeGroupState,
  sameGroupState,
  toggle,
  toggleGroupBucketCollapsed,
  setGroupState,
  updateGroupBucketState,
  updateGroupState,
  type ViewGroupPatch
} from './state'
import {
  type GroupWriteResult,
  writeGroupRecordValue
} from './write'

export const group = {
  state: {
    clone: cloneGroupState,
    normalize: normalizeGroupState,
    same: sameGroupState
  },
  write: {
    clear,
    set: setGroupState,
    toggle,
    update: updateGroupState
  },
  buckets: {
    write: {
      update: updateGroupBucketState,
      toggleCollapsed: toggleGroupBucketCollapsed
    }
  },
  record: {
    writeValue: writeGroupRecordValue
  }
} as const

export type {
  GroupWriteResult,
  ViewGroupPatch
}
