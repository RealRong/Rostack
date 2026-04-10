import type {
  SortRuleProjection,
  ViewSortProjection
} from '@dataview/core/sort'
import type {
  SortView
} from '../../types'
import type {
  Stage
} from '../runtime/stage'
import {
  reuse,
  shouldRun
} from '../runtime/stage'

const createSortRuleProjection = (input: {
  sorter: SortRuleProjection['sorter']
  fieldsById: ReadonlyMap<string, SortRuleProjection['field']>
}): SortRuleProjection => {
  const field = input.fieldsById.get(input.sorter.field)

  return {
    sorter: input.sorter,
    fieldId: input.sorter.field,
    field,
    fieldLabel: field?.name ?? 'Deleted field'
  }
}

const createSortProjection = (input: {
  viewId: string
  sorters: ViewSortProjection['rules'][number]['sorter'][]
  fieldsById: ReadonlyMap<string, SortRuleProjection['field']>
}): ViewSortProjection => ({
  viewId: input.viewId,
  active: input.sorters.length > 0,
  rules: input.sorters.map(sorter => createSortRuleProjection({
    sorter,
    fieldsById: input.fieldsById
  }))
})

export const sortStage: Stage<SortView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()

    return view && input.next.activeViewId
      ? createSortProjection({
          viewId: input.next.activeViewId,
          sorters: view.sort,
          fieldsById: input.next.read.fieldsById()
        })
      : undefined
  }
}
