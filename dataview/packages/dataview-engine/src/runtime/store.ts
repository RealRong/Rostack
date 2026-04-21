import { impact } from '@dataview/core/commit/impact'
import type { DataDoc } from '@dataview/core/contracts'
import { store } from '@shared/core'
import { resolveViewPlan } from '@dataview/engine/active/plan'
import { emptyNormalizedIndexDemand } from '@dataview/engine/active/index/demand'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { createViewRuntime } from '@dataview/engine/active/runtime'
import { createBaseImpact } from '@dataview/engine/active/shared/baseImpact'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'
import type { EngineRuntimeState } from '@dataview/engine/runtime/state'
import {
  projectDocumentPatch
} from '@dataview/engine/source/document'

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
    impact: createBaseImpact(resetImpact),
    capturePerf: input.capturePerf
  })

  return {
    rev: 0,
    doc: input.doc,
    documentPatch: projectDocumentPatch({
      document: input.doc,
      impact: resetImpact
    }),
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
