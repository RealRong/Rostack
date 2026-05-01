import {
  buildSearchFieldText,
  buildSearchRecordDefaultText,
  buildSearchRecordFieldText,
  buildSearchRecordTexts,
  isDefaultSearchField,
  matchSearchRecord,
  resolveSearchScopeFields,
  SearchTextContext
} from './text'
import {
  joinTokens,
  normalizeTokens,
  SEARCH_TOKEN_SEPARATOR,
  splitJoinedTokens
} from './tokens'
import {
  cloneSearchState,
  normalizeSearchState,
  sameSearchState,
  setSearchQuery
} from './state'

export type { SearchTextContext } from './text'

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
    split: splitJoinedTokens
  },
  record: {
    fieldText: buildSearchRecordFieldText,
    defaultText: buildSearchRecordDefaultText,
    texts: buildSearchRecordTexts,
    valueText: buildSearchFieldText,
    match: matchSearchRecord
  },
  scope: {
    isDefaultField: isDefaultSearchField,
    resolveFields: resolveSearchScopeFields
  }
} as const
