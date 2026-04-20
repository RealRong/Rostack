import { createResetCommitImpact } from '@dataview/core/commit/impact'
import type { DataDoc } from '@dataview/core/contracts'
import {
  createValueStore,
  type ValueStore
} from '@shared/core'
import { syncViewPlan } from '@dataview/engine/active/plan'
import { createIndexState } from '@dataview/engine/active/index/runtime'
import { createViewRuntime } from '@dataview/engine/active/runtime'
import { createActiveImpact } from '@dataview/engine/active/shared/impact'
import { createStaticDocumentReadContext } from '@dataview/engine/document/reader'
import type { EngineRuntimeState } from '@dataview/engine/runtime/state'
import {
  projectDocumentChange,
  projectEngineOutput
} from '@dataview/engine/source/project'

export type RuntimeStore = ValueStore<EngineRuntimeState>
export type { EngineRuntimeState } from '@dataview/engine/runtime/state'

export const createRuntimeState = (input: {
  doc: DataDoc
  historyCap: number
  capturePerf: boolean
}): EngineRuntimeState => {
  // The engine maintains exactly one derived runtime for the current active view.
  // Inactive views keep only document config and are rebuilt on demand when opened.
  const documentContext = createStaticDocumentReadContext(input.doc)
  const plan = syncViewPlan({
    context: documentContext,
    activeViewId: documentContext.activeViewId
  }).state
  const index = createIndexState(input.doc, plan?.demand)
  const currentView = createViewRuntime({
    documentContext,
    viewPlan: plan,
    index: index.state,
    impact: createActiveImpact(createResetCommitImpact(undefined, input.doc)),
    capturePerf: input.capturePerf
  })
  const documentChange = projectDocumentChange({
    impact: createResetCommitImpact(undefined, input.doc),
    document: input.doc
  })
  const output = projectEngineOutput({
    document: input.doc,
    documentChange,
    nextView: currentView.snapshot,
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
      demand: index.demand,
      index: index.state,
      cache: currentView.cache,
      ...(output.publishDelta
        ? { publishDelta: output.publishDelta }
        : {}),
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
): RuntimeStore => createValueStore<EngineRuntimeState>({
  initial
})
