import { now } from '@dataview/engine/runtime/clock'
import type {
  SnapshotTrace,
  ViewStageMetrics,
  ViewStageName,
  ViewStageTrace,
  ViewTrace
} from '@dataview/engine/contracts/performance'
import type {
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  ActivePhaseMetrics,
  ActivePhaseName
} from './types'
import type { ActiveProjectionTrace } from './types'

const SNAPSHOT_KEYS = [
  'view',
  'query',
  'records',
  'sections',
  'items',
  'fields',
  'table',
  'gallery',
  'kanban',
  'summaries'
] as const satisfies readonly (keyof ViewState)[]

const PHASE_ORDER = [
  'query',
  'membership',
  'summary',
  'publish'
] as const satisfies readonly ViewStageName[]

const toStageMetrics = (
  metrics: ActivePhaseMetrics | undefined
): ViewStageMetrics | undefined => {
  if (!metrics) {
    return undefined
  }

  const {
    deriveMs: _deriveMs,
    publishMs: _publishMs,
    ...stageMetrics
  } = metrics

  return Object.keys(stageMetrics).length
    ? stageMetrics
    : undefined
}

export const createSnapshotTrace = (
  previous: ViewState | undefined,
  next: ViewState | undefined
): SnapshotTrace => ({
  storeCount: SNAPSHOT_KEYS.length,
  changedStores: next
    ? SNAPSHOT_KEYS.flatMap(key => Object.is(previous?.[key], next[key])
      ? []
      : [key])
    : previous
      ? [...SNAPSHOT_KEYS]
      : []
})

export const createActiveProjectionTrace = (input: {
  previous: ViewState | undefined
  next: ViewState | undefined
  projectionTrace: ActiveProjectionTrace
}): {
  view: ViewTrace
  snapshot: SnapshotTrace
  snapshotMs: number
} => {
  const stagesByName = new Map(
    input.projectionTrace.phases.map(phase => [phase.name, phase] as const)
  )
  const stages: ViewStageTrace[] = PHASE_ORDER.map((stage) => {
    const phase = stagesByName.get(stage)
    const metrics = phase?.metrics

    return {
      stage,
      action: phase?.action ?? 'reuse',
      executed: phase !== undefined,
      changed: phase?.changed ?? false,
      durationMs: phase?.durationMs ?? 0,
      deriveMs: metrics?.deriveMs ?? 0,
      publishMs: metrics?.publishMs ?? 0,
      ...(toStageMetrics(metrics)
        ? {
            metrics: toStageMetrics(metrics)
          }
        : {})
    }
  })

  const snapshotStart = now()

  return {
    view: {
      plan: {
        query: stages[0].action,
        membership: stages[1].action,
        summary: stages[2].action,
        publish: stages[3].action
      },
      timings: {
        totalMs: input.projectionTrace.totalMs
      },
      stages
    },
    snapshot: createSnapshotTrace(input.previous, input.next),
    snapshotMs: now() - snapshotStart
  }
}
