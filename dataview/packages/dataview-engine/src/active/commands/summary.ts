import { setViewCalcMetric } from '@dataview/core/view'
import type { ActiveViewApi } from '#dataview-engine/contracts/public'
import type { ActiveViewContext } from '#dataview-engine/active/context'

export const createSummaryApi = (
  base: ActiveViewContext
): ActiveViewApi['summary'] => ({
  set: (fieldId, metric) => {
    base.withView(view => {
      base.commitPatch({
        calc: setViewCalcMetric(view.calc, fieldId, metric)
      })
    })
  }
})
