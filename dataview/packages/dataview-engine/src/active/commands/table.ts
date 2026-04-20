import type {
  CustomFieldId,
  CustomFieldKind
} from '@dataview/core/contracts'
import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { createFieldId } from '@dataview/engine/mutate/entityId'

const insertField = (
  base: ActiveViewContext,
  anchorFieldId: string,
  side: 'left' | 'right',
  input?: {
    name?: string
    kind?: CustomFieldKind
  }
): CustomFieldId | undefined => {
  const view = base.view()
  if (!view) {
    return undefined
  }

  const kind = input?.kind ?? 'text'
  const explicitName = input?.name?.trim()
  const name = explicitName
  if (!name) {
    return undefined
  }

  const fieldId = createFieldId()
  const beforeFieldId = viewApi.display.insertBefore(
    view.display.fields,
    anchorFieldId,
    side
  )
  const result = base.dispatch([
    {
      type: 'field.create',
      input: {
        id: fieldId,
        name,
        kind
      }
    },
    {
      type: 'view.patch',
      viewId: view.id,
      patch: {
        display: viewApi.display.show(view.display, fieldId, beforeFieldId)
      }
    }
  ])

  return result.applied
    ? fieldId
    : undefined
}

export const createTableApi = (input: {
  base: ActiveViewContext
}): ActiveViewApi['table'] => ({
  setColumnWidths: widths => input.base.patch(view => ({
    options: viewApi.layout.table.patch(view.options, {
      widths
    })
  })),
  setVerticalLines: value => input.base.patch(view => ({
    options: viewApi.layout.table.patch(view.options, {
      showVerticalLines: value
    })
  })),
  setWrap: value => input.base.patch(view => ({
    options: viewApi.layout.table.patch(view.options, {
      wrap: value
    })
  })),
  insertFieldLeft: (anchorFieldId, fieldInput) => {
    return insertField(input.base, anchorFieldId, 'left', fieldInput)
  },
  insertFieldRight: (anchorFieldId, fieldInput) => {
    return insertField(input.base, anchorFieldId, 'right', fieldInput)
  }
})
