import {
  document
} from '@dataview/core/document'
import type {
  EngineCore,
  EngineReadApi
} from '@dataview/engine/contracts'

export const createEngineReadApi = (
  core: EngineCore
): EngineReadApi => ({
  document: () => core.read.document(),
  record: recordId => document.records.get(core.read.document(), recordId),
  field: fieldId => document.fields.custom.get(core.read.document(), fieldId),
  view: viewId => document.views.get(core.read.document(), viewId),
  activeViewId: () => core.read.document().activeViewId,
  activeView: () => {
    const current = core.read.document()
    return current.activeViewId
      ? document.views.get(current, current.activeViewId)
      : undefined
  },
  activeState: () => core.read.active()
})
