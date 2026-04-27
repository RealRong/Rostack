import type {
  DataDoc,
  DataRecord,
  Search
} from '@dataview/core/types'
import { buildRecordTexts } from '@dataview/core/search/tokens'

export const matchSearchRecord = (
  record: DataRecord,
  search: Search,
  document: DataDoc
): boolean => {
  const query = search.query.trim().toLowerCase()
  if (!query) {
    return true
  }

  const candidates = buildRecordTexts(record, search, {
    document
  })

  return candidates.some(candidate => candidate.includes(query))
}
