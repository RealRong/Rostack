import type {
  DataDoc,
  DataRecord,
  Search
} from '#core/contracts/index.ts'
import { buildRecordSearchTexts } from '#core/search/tokens.ts'

export const matchSearchRecord = (
  record: DataRecord,
  search: Search,
  document: DataDoc
): boolean => {
  const query = search.query.trim().toLowerCase()
  if (!query) {
    return true
  }

  const candidates = buildRecordSearchTexts(record, search, document)

  return candidates.some(candidate => candidate.toLowerCase().includes(query))
}
