import type * as phase from '../contracts/phase'
import type * as projector from '../contracts/projector'
import type {
  DefaultPhaseScopeMap,
  PhaseScopeMap
} from '../contracts/scope'

export const defineProjectorSpec = <
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName extends string,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>,
  TPhaseChange = unknown,
  TPhaseMetrics = unknown
>(
  spec: projector.Spec<
    TInput,
    TWorking,
    TSnapshot,
    TChange,
    TPhaseName,
    TScopeMap,
    TPhaseChange,
    TPhaseMetrics
  >
): projector.Spec<
  TInput,
  TWorking,
  TSnapshot,
  TChange,
  TPhaseName,
  TScopeMap,
  TPhaseChange,
  TPhaseMetrics
> => spec

export const definePhase = <
  TName extends string,
  TContext,
  TChange = unknown,
  TMetrics = unknown,
  TPhaseName extends string = TName,
  TScopeMap extends PhaseScopeMap<TPhaseName> = DefaultPhaseScopeMap<TPhaseName>
>(
  spec: phase.Spec<
    TName,
    TContext,
    TChange,
    TMetrics,
    TPhaseName,
    TScopeMap
  >
): phase.Spec<
  TName,
  TContext,
  TChange,
  TMetrics,
  TPhaseName,
  TScopeMap
> => spec
