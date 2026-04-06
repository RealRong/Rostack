import type { CustomField } from '@dataview/core/contracts'
import { formatDateValue } from '@dataview/core/field'
import { cn } from '@ui/utils'
import { DateValueEditor } from '../editor/pickers/date/DateValueEditor'
import {
  createDateValueDraft,
  parseDateValueDraft,
  type DateValueDraft
} from '../editor/pickers/date/DateValueDraft'
import type { FieldValueSpec } from './contracts'
import { renderEmpty } from './shared'

export const createDatePropertySpec = (
  property: CustomField | undefined
): FieldValueSpec<DateValueDraft> => ({
  capability: {},
  panelWidth: 'calendar',
  Editor: DateValueEditor,
  createDraft: (value, seedDraft) => createDateValueDraft(property, value, seedDraft),
  parseDraft: parseDateValueDraft,
  render: props => {
    const display = formatDateValue(property, props.value)
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
