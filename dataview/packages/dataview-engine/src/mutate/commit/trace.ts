import {
  hasIndexImpact,
  summarizeCommitImpact,
  touchedFieldCountOfImpact,
  touchedRecordCountOfImpact,
  touchedViewCountOfImpact
} from '@dataview/core/commit/impact'
import type { CommitImpact } from '@dataview/core/contracts'
import type { TraceImpactSummary } from '@dataview/engine/contracts/public'

type WriteKind =
  | 'write'
  | 'undo'
  | 'redo'
  | 'load'

const addFact = (
  facts: Map<string, number>,
  kind: string,
  count: number | undefined
) => {
  if (!count) {
    return
  }

  facts.set(kind, (facts.get(kind) ?? 0) + count)
}

export const summarizeImpact = (
  impact: CommitImpact
): TraceImpactSummary => {
  const summary = summarizeCommitImpact(impact)
  const facts = new Map<string, number>()

  addFact(facts, 'record.insert', impact.records?.inserted?.size)
  addFact(facts, 'record.remove', impact.records?.removed?.size)
  addFact(facts, 'record.patch', impact.records?.patched?.size)
  addFact(facts, 'record.title', impact.records?.titleChanged?.size)
  addFact(facts, 'field.insert', impact.fields?.inserted?.size)
  addFact(facts, 'field.remove', impact.fields?.removed?.size)
  addFact(facts, 'field.schema', impact.fields?.schema?.size)
  addFact(facts, 'view.insert', impact.views?.inserted?.size)
  addFact(facts, 'view.remove', impact.views?.removed?.size)
  addFact(facts, 'view.change', impact.views?.changed?.size)
  addFact(facts, 'activeView.set', impact.activeView ? 1 : undefined)
  addFact(facts, 'external.version.bump', impact.external?.versionBumped ? 1 : undefined)
  addFact(facts, 'reset', impact.reset ? 1 : undefined)

  return {
    summary: {
      ...summary,
      indexes: hasIndexImpact(impact)
    },
    facts: Array.from(facts.entries()).map(([kind, count]) => ({
      kind,
      ...(count > 1 ? { count } : {})
    })),
    entities: {
      touchedRecordCount: touchedRecordCountOfImpact(impact),
      touchedFieldCount: touchedFieldCountOfImpact(impact),
      touchedViewCount: touchedViewCountOfImpact(impact)
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
