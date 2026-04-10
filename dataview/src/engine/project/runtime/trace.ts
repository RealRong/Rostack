import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  Section,
  SectionKey
} from '../types'
import type {
  ProjectStageMetrics
} from '../../types'
import type {
  ProjectState
} from './state'

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
  previous: readonly Section[] | undefined,
  next: readonly Section[] | undefined
) => {
  if (!previous?.length || !next?.length) {
    return 0
  }

  const previousByKey = new Map(previous.map(section => [section.key, section] as const))
  return next.reduce((count, section) => count + (
    previousByKey.get(section.key) === section ? 1 : 0
  ), 0)
}

const countChangedSections = (
  previous: readonly Section[] | undefined,
  next: readonly Section[] | undefined
) => {
  const previousByKey = new Map((previous ?? []).map(section => [section.key, section] as const))
  const nextByKey = new Map((next ?? []).map(section => [section.key, section] as const))
  const keys = new Set([
    ...Array.from(previousByKey.keys()),
    ...Array.from(nextByKey.keys())
  ])

  return Array.from(keys).reduce((count, key) => count + (
    previousByKey.get(key) === nextByKey.get(key) ? 0 : 1
  ), 0)
}

const countReusedCalculations = (
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
  stage: 'query' | 'sections' | 'calc',
  previous: ProjectState[keyof ProjectState],
  next: ProjectState[keyof ProjectState]
): ProjectStageMetrics | undefined => {
  switch (stage) {
    case 'query': {
      const previousRecords = previous as ProjectState['records']
      const nextRecords = next as ProjectState['records']
      if (!nextRecords) {
        return undefined
      }

      const reusedNodeCount = (
        (previousRecords?.derivedIds === nextRecords.derivedIds ? 1 : 0)
        + (previousRecords?.orderedIds === nextRecords.orderedIds ? 1 : 0)
        + (previousRecords?.visibleIds === nextRecords.visibleIds ? 1 : 0)
      )
      const changedRecordCount = countChangedIds(previousRecords?.visibleIds, nextRecords.visibleIds)

      return {
        inputCount: previousRecords?.visibleIds.length,
        outputCount: nextRecords.visibleIds.length,
        reusedNodeCount,
        rebuiltNodeCount: 3 - reusedNodeCount,
        ...(changedRecordCount === undefined ? {} : { changedRecordCount })
      }
    }
    case 'sections': {
      const previousSections = previous as ProjectState['sections']
      const nextSections = next as ProjectState['sections']
      if (!nextSections) {
        return undefined
      }

      const reusedNodeCount = countReusedSections(previousSections, nextSections)
      return {
        inputCount: previousSections?.length,
        outputCount: nextSections.length,
        reusedNodeCount,
        rebuiltNodeCount: nextSections.length - reusedNodeCount,
        changedSectionCount: countChangedSections(previousSections, nextSections)
      }
    }
    case 'calc': {
      const previousCalculations = previous as ProjectState['calculations']
      const nextCalculations = next as ProjectState['calculations']
      if (!nextCalculations) {
        return undefined
      }

      const reusedNodeCount = countReusedCalculations(previousCalculations, nextCalculations)
      return {
        inputCount: previousCalculations?.size,
        outputCount: nextCalculations.size,
        reusedNodeCount,
        rebuiltNodeCount: nextCalculations.size - reusedNodeCount,
        changedSectionCount: nextCalculations.size - reusedNodeCount
      }
    }
  }
}
