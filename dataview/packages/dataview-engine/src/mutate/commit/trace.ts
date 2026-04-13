import type { CommitResult, TraceDeltaSummary } from '#engine/contracts/public.ts'

type WriteKind =
  | 'write'
  | 'undo'
  | 'redo'
  | 'load'

const touchedCount = (
  all: boolean,
  ids: readonly string[]
): number | 'all' | undefined => {
  if (all) {
    return 'all'
  }
  return ids.length
    ? new Set(ids).size
    : undefined
}

export const summarizeDelta = (
  delta: NonNullable<CommitResult['changes']>
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
      touchedRecordCount: touchedCount(
        delta.entities.records?.update === 'all'
        || delta.entities.values?.records === 'all',
        [
          ...(delta.entities.records?.add ?? []),
          ...(Array.isArray(delta.entities.records?.update) ? delta.entities.records.update : []),
          ...(delta.entities.records?.remove ?? []),
          ...(Array.isArray(delta.entities.values?.records) ? delta.entities.values.records : [])
        ]
      ),
      touchedFieldCount: touchedCount(
        delta.entities.fields?.update === 'all'
        || delta.entities.values?.fields === 'all',
        [
          ...(delta.entities.fields?.add ?? []),
          ...(Array.isArray(delta.entities.fields?.update) ? delta.entities.fields.update : []),
          ...(delta.entities.fields?.remove ?? []),
          ...(Array.isArray(delta.entities.values?.fields) ? delta.entities.values.fields : [])
        ]
      ),
      touchedViewCount: touchedCount(
        delta.entities.views?.update === 'all',
        [
          ...(delta.entities.views?.add ?? []),
          ...(Array.isArray(delta.entities.views?.update) ? delta.entities.views.update : []),
          ...(delta.entities.views?.remove ?? [])
        ]
      )
    }
  }
}

export const toTraceKind = (
  kind: WriteKind
): 'dispatch' | 'undo' | 'redo' | 'replace' => {
  switch (kind) {
    case 'write':
      return 'dispatch'
    case 'undo':
      return 'undo'
    case 'redo':
      return 'redo'
    case 'load':
      return 'replace'
  }
}
