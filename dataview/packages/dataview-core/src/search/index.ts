import { matchSearchRecord } from '@dataview/core/search/execute'
import {
  buildFieldText,
  buildRecordDefaultText,
  buildRecordFieldText,
  buildRecordTexts,
  isDefaultSearchField,
  joinTokens,
  normalizeTokens,
  SEARCH_TOKEN_SEPARATOR,
  splitText
} from '@dataview/core/search/tokens'
import {
  cloneSearchState,
  normalizeSearchState,
  sameSearchState,
  setSearchQuery
} from '@dataview/core/search/state'

export type {
  SearchTextContext
} from '@dataview/core/search/tokens'

export const search = {
  state: {
    clone: cloneSearchState,
    normalize: normalizeSearchState,
    same: sameSearchState,
    setQuery: setSearchQuery
  },
  tokens: {
    separator: SEARCH_TOKEN_SEPARATOR,
    normalize: normalizeTokens,
    join: joinTokens,
    split: splitText
  },
  text: {
    field: buildFieldText,
    record: {
      field: buildRecordFieldText,
      default: buildRecordDefaultText,
      all: buildRecordTexts
    }
  },
  field: {
    default: isDefaultSearchField
  },
  match: {
    record: matchSearchRecord
  }
} as const
