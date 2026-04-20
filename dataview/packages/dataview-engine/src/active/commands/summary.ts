import { view as viewApi } from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createSummaryApi = (
  base: ActiveViewContext
): ActiveViewApi['summary'] => ({
  set: (fieldId, metric) => base.patch(view => ({
    calc: viewApi.calc.set(view.calc, fieldId, metric)
  }))
})
