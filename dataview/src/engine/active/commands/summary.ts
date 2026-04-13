import { setViewCalcMetric } from '@dataview/core/view'
import type { ViewApi } from '../../contracts/public'
import type { ViewBaseContext } from './base'

export const createSummaryApi = (
  base: ViewBaseContext
): ViewApi['summary'] => ({
  set: (fieldId, metric) => {
    base.withView(view => {
      base.commitPatch({
        calc: setViewCalcMetric(view.calc, fieldId, metric)
      })
    })
  }
})
