import type { CustomField } from '@dataview/core/contracts'
import { formatDateValue } from '@dataview/core/field'
import { cn } from '@shared/ui/utils'
import { DateValueEditor } from '#react/field/value/editor/pickers/date/DateValueEditor.tsx'
import {
  createDateValueDraft,
  parseDateValueDraft,
  type DateValueDraft
} from '#react/field/value/editor/pickers/date/DateValueDraft.ts'
import type { FieldValueSpec } from '#react/field/value/kinds/contracts.ts'
import { renderEmpty } from '#react/field/value/kinds/shared.tsx'

export const createDatePropertySpec = (
  field: CustomField | undefined
): FieldValueSpec<DateValueDraft> => ({
  capability: {},
  panelWidth: 'calendar',
  Editor: DateValueEditor,
  createDraft: (value, seedDraft) => createDateValueDraft(field, value, seedDraft),
  parseDraft: parseDateValueDraft,
  render: props => {
    const display = formatDateValue(field, props.value)
    if (!display) {
      return renderEmpty(props)
    }

    return (
      <span className={cn('block truncate', props.className)}>
        {display}
      </span>
    )
  }
})
