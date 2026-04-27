import type { Field } from '@dataview/core/types'
import { field as fieldApi } from '@dataview/core/field'
import { cn } from '@shared/ui/utils'
import { DateValueEditor } from '@dataview/react/field/value/editor/pickers/date/DateValueEditor'
import {
  createDateValueDraft,
  parseDateValueDraft,
  type DateValueDraft
} from '@dataview/react/field/value/editor/pickers/date/DateValueDraft'
import type { FieldValueSpec } from '@dataview/react/field/value/kinds/contracts'
import { renderEmpty } from '@dataview/react/field/value/kinds/shared'

const readCustomField = (
  field?: Field
) => fieldApi.kind.isCustom(field)
  ? field
  : undefined

export const dateFieldValueSpec: FieldValueSpec<DateValueDraft> = {
  capability: {},
  panelWidth: 'calendar',
  Editor: DateValueEditor,
  createDraft: (field, value, seedDraft) => createDateValueDraft(
    readCustomField(field),
    value,
    seedDraft
  ),
  parseDraft: (_field, draft) => parseDateValueDraft(draft),
  render: (field, props) => {
    const display = fieldApi.date.display.value(
      readCustomField(field),
      props.value
    )
    if (!display) {
      return renderEmpty(props)
    }

    return (
      <span
        className={cn(
          'block',
          props.wrap
            ? 'whitespace-normal break-words [overflow-wrap:anywhere]'
            : 'truncate',
          props.className
        )}
      >
        {display}
      </span>
    )
  }
}
