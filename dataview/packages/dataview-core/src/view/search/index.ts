import { matchSearchRecord } from './searchExecute'
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
} from './searchText'
import {
  cloneSearchState,
  normalizeSearchState,
  sameSearchState,
  setSearchQuery
} from './searchState'

export type {
  SearchTextContext
} from './searchText'

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
