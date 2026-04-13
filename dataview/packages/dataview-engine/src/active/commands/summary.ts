import { setViewCalcMetric } from '@dataview/core/view'
import type { ActiveViewApi } from '#engine/contracts/public.ts'
import type { ActiveViewContext } from '#engine/active/context.ts'

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
