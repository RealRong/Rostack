import type {
  Origin
} from '@shared/mutation'
import {
  mutationTrace
} from '@shared/core'
import {
  dataviewTrace,
  type DataviewTrace
} from '@dataview/core/mutation'
import type {
  TraceImpactSummary
} from '@dataview/engine/contracts/performance'

export const summarizeTrace = (
  trace: DataviewTrace
): TraceImpactSummary => {
  const summary = mutationTrace.createMutationTrace<
    TraceImpactSummary['summary'],
    TraceImpactSummary['entities']
  >({
    summary: {
      ...dataviewTrace.summary(trace),
      indexes: false
    },
    entities: {
      touchedRecordCount: undefined,
      touchedFieldCount: undefined,
      touchedViewCount: undefined
    }
  })

  summary.setSummary('indexes', dataviewTrace.has.index(trace))
  summary.addFact('record.insert', trace.records?.inserted)
  summary.addFact('record.remove', trace.records?.removed)
  summary.addFact('record.patch', trace.records?.patched)
  summary.addFact('record.value', trace.values?.touched)
  summary.addFact('field.insert', trace.fields?.inserted)
  summary.addFact('field.remove', trace.fields?.removed)
  summary.addFact('field.schema', trace.fields?.schema)
  summary.addFact('view.insert', trace.views?.inserted)
  summary.addFact('view.remove', trace.views?.removed)
  summary.addFact('view.change', trace.views?.changed)
  summary.addFact('activeView.set', Boolean(trace.activeView))
  summary.addFact('external.version.bump', Boolean(trace.external?.versionBumped))
  summary.addFact('reset', Boolean(trace.reset))
  summary.setEntity('touchedRecordCount', dataviewTrace.record.touchedCount(trace))
  summary.setEntity('touchedFieldCount', dataviewTrace.field.touchedCount(trace))
  summary.setEntity('touchedViewCount', dataviewTrace.view.touchedCount(trace))

  return summary.finish()
}

export const toPerformanceKind = (
  origin: Origin
): 'dispatch' | 'undo' | 'redo' | 'replace' => {
  switch (origin) {
    case 'history':
      return 'undo'
    case 'load':
      return 'replace'
    default:
      return 'dispatch'
  }
}
