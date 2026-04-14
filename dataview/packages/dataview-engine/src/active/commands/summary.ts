import { setViewCalcMetric } from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { withViewPatch } from '@dataview/engine/active/commands/shared'

export const createSummaryApi = (
  base: ActiveViewContext
): ActiveViewApi['summary'] => ({
  set: (fieldId, metric) => withViewPatch(base, view => ({
    calc: setViewCalcMetric(view.calc, fieldId, metric)
  }))
})
