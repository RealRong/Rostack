import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  AppearanceId,
  AppearanceList
} from '../project/model'

export const recordIdsOfAppearances = (
  appearances: Pick<AppearanceList, 'get'>,
  ids: readonly AppearanceId[]
): readonly RecordId[] => {
  const seen = new Set<RecordId>()
  const next: RecordId[] = []

  ids.forEach(id => {
    const recordId = appearances.get(id)?.recordId
    if (!recordId || seen.has(recordId)) {
      return
    }

    seen.add(recordId)
    next.push(recordId)
  })

  return next
}
