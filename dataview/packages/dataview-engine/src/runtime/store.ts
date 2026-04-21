import { impact } from '@dataview/core/commit/impact'
import type { DataDoc } from '@dataview/core/contracts'
import { store } from '@shared/core'
import { resolveViewPlan } from '@dataview/engine/active/plan'
import { emptyNormalizedIndexDemand } from '@dataview/engine/active/index/demand'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { createViewRuntime } from '@dataview/engine/active/runtime'
import { createActiveImpact } from '@dataview/engine/active/shared/impact'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'
import type { EngineRuntimeState } from '@dataview/engine/runtime/state'
import {
  projectSourceOutput
} from '@dataview/engine/source/project'

export type RuntimeStore = store.ValueStore<EngineRuntimeState>
export type { EngineRuntimeState } from '@dataview/engine/runtime/state'

export const createRuntimeState = (input: {
  doc: DataDoc
  historyCap: number
  capturePerf: boolean
}): EngineRuntimeState => {
  // The engine maintains exactly one derived runtime for the current active view.
  // Inactive views keep only document config and are rebuilt on demand when opened.
  const documentContext = createStaticDocumentReadContext(input.doc)
  const plan = resolveViewPlan(documentContext, documentContext.activeViewId)
  const index = createIndexState(input.doc, plan?.index ?? emptyNormalizedIndexDemand())
  const resetImpact = impact.reset(undefined, input.doc)
  const currentView = createViewRuntime({
    documentContext,
    viewPlan: plan,
    index,
    impact: createActiveImpact(resetImpact),
    capturePerf: input.capturePerf
  })
  const output = projectSourceOutput({
    document: input.doc,
    impact: resetImpact,
    nextView: currentView.snapshot,
    snapshotChange: currentView.delta,
    previousLayout: null
  })

  return {
    rev: 0,
    doc: input.doc,
    history: {
      cap: input.historyCap,
      undo: [],
      redo: []
    },
    currentView: {
      ...(plan
        ? { plan }
        : {}),
      index,
      cache: currentView.cache,
      sourceDelta: output.sourceDelta,
      tableLayout: output.tableLayout,
      ...(currentView.snapshot
        ? { snapshot: currentView.snapshot }
        : {})
    }
  }
}

export const createStore = (
  initial: EngineRuntimeState
): RuntimeStore => store.createValueStore<EngineRuntimeState>({
  initial
})
