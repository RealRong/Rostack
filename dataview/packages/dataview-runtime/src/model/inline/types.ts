import type {
  KeyedReadStore
} from '@shared/core'
import type {
  InlineSessionApi
} from '@dataview/runtime/inlineSession'

export interface DataViewInlineRuntime {
  editing: KeyedReadStore<string, boolean>
  key: InlineSessionApi['key']
}
