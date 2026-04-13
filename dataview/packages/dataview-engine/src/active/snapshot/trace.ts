import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  SectionKey,
  SectionList,
  ViewRecords,
  ViewStageMetrics,
  ViewState
} from '#engine/contracts/public'

const countChangedIds = (
  previous: readonly string[] | undefined,
  next: readonly string[] | undefined
): number | undefined => {
  if (!previous || !next) {
    return next?.length
  }

  if (previous === next) {
    return 0
  }

  return previous.length !== next.length
    ? Math.max(previous.length, next.length)
    : undefined
}

const countReusedSections = (
  previous: SectionList | undefined,
  next: SectionList | undefined
) => {
  if (!previous?.all.length || !next?.all.length) {
    return 0
  }

  const previousByKey = new Map(previous.all.map(section => [section.key, section] as const))
  return next.all.reduce((count, section) => count + (
    previousByKey.get(section.key) === section ? 1 : 0
  ), 0)
}

const countChangedSections = (
  previous: SectionList | undefined,
  next: SectionList | undefined
) => {
  const previousByKey = new Map((previous?.all ?? []).map(section => [section.key, section] as const))
  const nextByKey = new Map((next?.all ?? []).map(section => [section.key, section] as const))
  const keys = new Set([
    ...Array.from(previousByKey.keys()),
    ...Array.from(nextByKey.keys())
  ])

  return Array.from(keys).reduce((count, key) => count + (
    previousByKey.get(key) === nextByKey.get(key) ? 0 : 1
  ), 0)
}

const countReusedSummaries = (
  previous: ReadonlyMap<SectionKey, CalculationCollection> | undefined,
  next: ReadonlyMap<SectionKey, CalculationCollection> | undefined
) => {
  if (!previous || !next) {
    return 0
  }

  return Array.from(next.entries()).reduce((count, [sectionKey, collection]) => count + (
    previous.get(sectionKey) === collection ? 1 : 0
  ), 0)
}

export const buildStageMetrics = (
  stage: 'query' | 'sections' | 'summary',
  previous: ViewState | undefined,
  next: ViewState | undefined
): ViewStageMetrics | undefined => {
  switch (stage) {
    case 'query': {
      const previousRecords = previous?.records
      const nextRecords = next?.records
      if (!nextRecords) {
        return undefined
      }

      const reusedNodeCount = (
        (previousRecords?.matched === nextRecords.matched ? 1 : 0)
        + (previousRecords?.ordered === nextRecords.ordered ? 1 : 0)
        + (previousRecords?.visible === nextRecords.visible ? 1 : 0)
      )
      const changedRecordCount = countChangedIds(previousRecords?.visible, nextRecords.visible)

      return {
        inputCount: previousRecords?.visible.length,
        outputCount: nextRecords.visible.length,
        reusedNodeCount,
        rebuiltNodeCount: 3 - reusedNodeCount,
        ...(changedRecordCount === undefined ? {} : { changedRecordCount })
      }
    }
    case 'sections': {
      const previousSections = previous?.sections
      const nextSections = next?.sections
      if (!nextSections) {
        return undefined
      }

      const reusedNodeCount = countReusedSections(previousSections, nextSections)
      return {
        inputCount: previousSections?.all.length,
        outputCount: nextSections.all.length,
        reusedNodeCount,
        rebuiltNodeCount: nextSections.all.length - reusedNodeCount,
        changedSectionCount: countChangedSections(previousSections, nextSections)
      }
    }
    case 'summary': {
      const previousSummaries = previous?.summaries
      const nextSummaries = next?.summaries
      if (!nextSummaries) {
        return undefined
      }

      const reusedNodeCount = countReusedSummaries(previousSummaries, nextSummaries)
      return {
        inputCount: previousSummaries?.size,
        outputCount: nextSummaries.size,
        reusedNodeCount,
        rebuiltNodeCount: nextSummaries.size - reusedNodeCount,
        changedSectionCount: nextSummaries.size - reusedNodeCount
      }
    }
  }
}
