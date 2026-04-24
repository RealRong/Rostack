import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import type { CommitImpact } from '@dataview/core/contracts'
import type { TraceImpactSummary } from '@dataview/engine/contracts/performance'
import { mutationTrace } from '@shared/core'

type WriteKind =
  | 'write'
  | 'undo'
  | 'redo'
  | 'load'

export const summarizeImpact = (
  impact: CommitImpact
): TraceImpactSummary => {
  const trace = mutationTrace.createMutationTrace<
    TraceImpactSummary['summary'],
    TraceImpactSummary['entities']
  >({
    summary: {
      ...commitImpact.summary(impact),
      indexes: false
    },
    entities: {
      touchedRecordCount: undefined,
      touchedFieldCount: undefined,
      touchedViewCount: undefined
    }
  })

  trace.setSummary('indexes', commitImpact.has.index(impact))
  trace.addFact('record.insert', impact.records?.inserted)
  trace.addFact('record.remove', impact.records?.removed)
  trace.addFact('record.patch', impact.records?.patched)
  trace.addFact('record.value', impact.values?.touched)
  trace.addFact('field.insert', impact.fields?.inserted)
  trace.addFact('field.remove', impact.fields?.removed)
  trace.addFact('field.schema', impact.fields?.schema)
  trace.addFact('view.insert', impact.views?.inserted)
  trace.addFact('view.remove', impact.views?.removed)
  trace.addFact('view.change', impact.views?.changed)
  trace.addFact('activeView.set', Boolean(impact.activeView))
  trace.addFact('external.version.bump', Boolean(impact.external?.versionBumped))
  trace.addFact('reset', Boolean(impact.reset))
  trace.setEntity('touchedRecordCount', commitImpact.record.touchedCount(impact))
  trace.setEntity('touchedFieldCount', commitImpact.field.touchedCount(impact))
  trace.setEntity('touchedViewCount', commitImpact.view.touchedCount(impact))

  return trace.finish()
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
