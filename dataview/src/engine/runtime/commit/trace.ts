import type {
  CommitDelta
} from '@dataview/core/contracts'
import type {
  CommitTrace,
  TraceDeltaSummary
} from '../../types'

export const createTraceDeltaSummary = (
  delta: CommitDelta
): TraceDeltaSummary => {
  const semantics = new Map<string, number>()
  delta.semantics.forEach(item => {
    semantics.set(item.kind, (semantics.get(item.kind) ?? 0) + 1)
  })

  return {
    summary: {
      ...delta.summary
    },
    semantics: Array.from(semantics.entries()).map(([kind, count]) => ({
      kind,
      ...(count > 1 ? { count } : {})
    })),
    entities: {
      touchedRecordCount: (
        delta.entities.records?.update === 'all'
        || delta.entities.values?.records === 'all'
      )
        ? 'all'
        : new Set([
            ...(delta.entities.records?.add ?? []),
            ...(Array.isArray(delta.entities.records?.update) ? delta.entities.records.update : []),
            ...(delta.entities.records?.remove ?? []),
            ...(Array.isArray(delta.entities.values?.records) ? delta.entities.values.records : [])
          ]).size || undefined,
      touchedFieldCount: (
        delta.entities.fields?.update === 'all'
        || delta.entities.values?.fields === 'all'
      )
        ? 'all'
        : new Set([
            ...(delta.entities.fields?.add ?? []),
            ...(Array.isArray(delta.entities.fields?.update) ? delta.entities.fields.update : []),
            ...(delta.entities.fields?.remove ?? []),
            ...(Array.isArray(delta.entities.values?.fields) ? delta.entities.values.fields : [])
          ]).size || undefined,
      touchedViewCount: (
        delta.entities.views?.update === 'all'
          ? 'all'
          : new Set([
              ...(delta.entities.views?.add ?? []),
              ...(Array.isArray(delta.entities.views?.update) ? delta.entities.views.update : []),
              ...(delta.entities.views?.remove ?? [])
            ]).size || undefined
      )
    }
  }
}

export type CommitTraceKind = Omit<CommitTrace, 'id' | 'timings' | 'delta' | 'index' | 'project' | 'publish'>['kind']
