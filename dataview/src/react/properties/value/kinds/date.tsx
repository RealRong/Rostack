import type { GroupProperty } from '@/core/contracts'
import { formatDateValue } from '@/core/property'
import { cn } from '@/react/ui'
import { DateValueEditor } from '../editor/pickers/date/DateValueEditor'
import {
  createDateValueDraft,
  parseDateValueDraft,
  type DateValueDraft
} from '../editor/pickers/date/DateValueDraft'
import type { PropertyValueSpec } from './contracts'
import { renderEmpty } from './shared'

export const createDatePropertySpec = (
  property: GroupProperty | undefined
): PropertyValueSpec<DateValueDraft> => ({
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
