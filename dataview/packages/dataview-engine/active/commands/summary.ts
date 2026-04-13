import { setViewCalcMetric } from '@dataview/core/view'
import type { ActiveViewApi } from '../../contracts/public'
import type { ActiveViewContext } from '../context'

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
