import type {
  RecordId
} from '@dataview/core/contracts'
import type {
  AppearanceList,
  Section,
  SectionKey
} from '../project/model'
import {
  recordIdsOfAppearances
} from './appearances'

const emptyIds = [] as const

export const sectionIds = (
  source: readonly Pick<Section, 'key' | 'ids'>[],
  sectionKey: SectionKey
) => source.find(section => section.key === sectionKey)?.ids ?? emptyIds

export const readSectionRecordIds = (input: {
  sections: readonly Pick<Section, 'key' | 'ids'>[]
  appearances: Pick<AppearanceList, 'get'>
}, sectionKey: SectionKey): readonly RecordId[] => {
  const ids = sectionIds(input.sections, sectionKey)
  return ids.length
    ? recordIdsOfAppearances(input.appearances, ids)
    : emptyIds
}
