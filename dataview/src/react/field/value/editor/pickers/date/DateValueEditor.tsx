import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react'
import type { CustomField } from '@dataview/core/contracts'
import {
  formatTimeZoneLabel,
  type DateDisplayFormat,
  type DateTimeFormat,
  getAvailableTimezones,
} from '@dataview/core/field'
import { Input } from '@ui/input'
import { Menu, type MenuItem } from '@ui/menu'
import { cn } from '@ui/utils'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import type { FieldValueDraftEditorProps } from '../../contracts'
import { focusInputWithoutScroll } from '@dataview/dom/focus'
import {
  isComposing,
  keyAction
} from '../../shared/keyboard'
import { useDraftCommit } from '../../shared/useDraftCommit'
import {
  applyDateDraftNow,
  clearDateValueDraft,
  readDateDraftBoundaryDate,
  setDateDraftActiveBoundary,
  setDateDraftBoundaryDate,
  setDateDraftBoundaryTime,
  setDateDraftKind,
  setDateDraftRangeEnabled,
  setDateDraftTimezone,
  type DateDraftBoundary,
  type DateValueDraft
} from './DateValueDraft'
import { DateCalendar } from './DateCalendar'

const FLOATING_TIMEZONE_ID = '__floating__'

const DateBoundarySection = (props: {
  boundary: DateDraftBoundary
  draft: DateValueDraft
  showTime: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onActivate: () => void
  onDateChange: (value: string) => void
  onTimeChange: (value: string) => void
}) => {
  const dateValue = readDateDraftBoundaryDate(props.draft, props.boundary)
  const timeValue = props.boundary === 'end'
    ? props.draft.endTime
    : props.draft.startTime

  return (
    <div
      className={'flex flex-col gap-2'}
      onMouseDownCapture={() => props.onActivate()}
    >
      <div className={props.showTime ? 'grid grid-cols-[minmax(0,1fr)_108px] gap-2' : 'grid grid-cols-1'}>
        <Input
          ref={props.inputRef}
          value={dateValue}
          onFocus={props.onActivate}
          onChange={event => props.onDateChange(event.target.value)}
        />
        {props.showTime ? (
          <Input
            step={60}
            value={timeValue}
            onFocus={props.onActivate}
            onChange={event => props.onTimeChange(event.target.value)}
          />
        ) : null}
      </div>
    </div>
  )
}

export const DateValueEditor = (
  props: FieldValueDraftEditorProps<DateValueDraft>
) => {
  const editor = useDataView().engine
  const startDateRef = useRef<HTMLInputElement | null>(null)
  const property = props.property?.kind === 'date'
    ? props.property
    : undefined
  const dateConfig = property ?? {
    displayDateFormat: 'short' as const,
    displayTimeFormat: '12h' as const,
    defaultValueKind: 'date' as const,
    defaultTimezone: null as string | null
  }
  const displayDateFormat = meta.field.date.displayDateFormat.get(dateConfig.displayDateFormat)
  const displayTimeFormat = meta.field.date.displayTimeFormat.get(dateConfig.displayTimeFormat)
  const timezones = useMemo(
    () => getAvailableTimezones(),
    []
  )
  const defaultTimezone = property?.defaultTimezone ?? null
  const { commitDraft } = useDraftCommit({
    onDraftChange: props.onDraftChange,
    onApply: props.onApply,
    onCommit: props.onCommit
  })

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(startDateRef.current, {
      select: true
    })
  }, [props.autoFocus])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const action = keyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      composing: isComposing(event.nativeEvent)
    })

    if (action.type === 'cancel') {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
      return
    }

    if (
      action.type === 'commit'
      && !(event.target instanceof HTMLButtonElement)
      && !(event.target instanceof HTMLSelectElement)
    ) {
      event.preventDefault()
      event.stopPropagation()
      props.onCommit(action.trigger)
      return
    }

    event.stopPropagation()
  }

  const setDraft = (draft: DateValueDraft) => {
    props.onDraftChange(draft)
  }

  const updatePropertyConfig = (
    patch: Partial<typeof dateConfig>
  ) => {
    if (!property) {
      return
    }

    editor.fields.update(property.id, {
      ...patch
    } as Partial<Omit<CustomField, 'id'>>)
  }

  const settingsItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        kind: 'toggle',
        key: 'end-date',
        label: '结束日期',
        checked: props.draft.endEnabled,
        indicator: 'switch',
        onSelect: () => setDraft(
          setDateDraftRangeEnabled(props.draft, !props.draft.endEnabled)
        )
      },
      {
        kind: 'toggle',
        key: 'include-time',
        label: '包含时间',
        checked: props.draft.kind === 'datetime',
        indicator: 'switch',
        onSelect: () => setDraft(
          setDateDraftKind(
            props.draft,
            props.draft.kind === 'datetime' ? 'date' : 'datetime',
            defaultTimezone
          )
        )
      },
      {
        kind: 'submenu',
        key: 'display-date-format',
        label: '日期格式',
        suffix: renderMessage(displayDateFormat.message),
        contentClassName: 'w-[220px] p-1.5',
          items: meta.field.date.displayDateFormat.list.map(option => ({
            kind: 'toggle' as const,
            key: option.id,
            label: renderMessage(option.message),
            checked: dateConfig.displayDateFormat === option.id,
            onSelect: () => updatePropertyConfig({
              displayDateFormat: option.id as DateDisplayFormat
            })
          }))
      }
    ]

    if (props.draft.kind === 'datetime') {
      items.push(
        {
          kind: 'submenu',
          key: 'display-time-format',
          label: '时间格式',
          suffix: renderMessage(displayTimeFormat.message),
          contentClassName: 'w-[220px] p-1.5',
          items: meta.field.date.displayTimeFormat.list.map(option => ({
            kind: 'toggle' as const,
            key: option.id,
            label: renderMessage(option.message),
            checked: dateConfig.displayTimeFormat === option.id,
            onSelect: () => updatePropertyConfig({
              displayTimeFormat: option.id as DateTimeFormat
            })
          }))
        },
        {
          kind: 'submenu',
          key: 'timezone',
          label: '时区',
          suffix: formatTimeZoneLabel(props.draft.timezone),
          contentClassName: 'w-[240px] p-1.5',
          items: [
            {
              kind: 'toggle' as const,
              key: FLOATING_TIMEZONE_ID,
              label: formatTimeZoneLabel(null),
              checked: props.draft.timezone === null,
              onSelect: () => setDraft(
                setDateDraftTimezone(props.draft, null)
              )
            },
            ...timezones.map(timeZone => ({
              kind: 'toggle' as const,
              key: timeZone,
              label: formatTimeZoneLabel(timeZone),
              checked: props.draft.timezone === timeZone,
              onSelect: () => setDraft(
                setDateDraftTimezone(props.draft, timeZone)
              )
            }))
          ]
        }
      )
    }

    items.push(
      {
        kind: 'divider',
        key: 'divider-clear'
      },
      {
        kind: 'action',
        key: 'clear',
        label: '清除',
        tone: 'destructive',
        onSelect: () => commitDraft(clearDateValueDraft(props.draft))
      }
    )

    return items
  }, [
    commitDraft,
    dateConfig,
    defaultTimezone,
    displayDateFormat.message,
    displayTimeFormat.message,
    props.draft,
    setDraft,
    timezones
  ])

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div className={'flex flex-col'}>
        <div className={cn('grid gap-3 p-2', props.draft.endEnabled && props.draft.kind === 'date' ? 'grid-cols-2' : 'grid-cols-1')}>
          <DateBoundarySection
            boundary="start"
            draft={props.draft}
            showTime={props.draft.kind === 'datetime'}
            inputRef={startDateRef}
            onActivate={() => setDraft(
              setDateDraftActiveBoundary(props.draft, 'start')
            )}
            onDateChange={value => setDraft(
              setDateDraftBoundaryDate(props.draft, 'start', value)
            )}
            onTimeChange={value => setDraft(
              setDateDraftBoundaryTime(props.draft, 'start', value)
            )}
          />

          {props.draft.endEnabled ? (
            <DateBoundarySection
              boundary="end"
              draft={props.draft}
              showTime={props.draft.kind === 'datetime'}
              onActivate={() => setDraft(
                setDateDraftActiveBoundary(props.draft, 'end')
              )}
              onDateChange={value => setDraft(
                setDateDraftBoundaryDate(props.draft, 'end', value)
              )}
              onTimeChange={value => setDraft(
                setDateDraftBoundaryTime(props.draft, 'end', value)
              )}
            />
          ) : null}

        </div>
        <div className="p-3 pt-1">
          <DateCalendar
            draft={props.draft}
            onSelectDate={value => setDraft(
              setDateDraftBoundaryDate(props.draft, props.draft.active, value)
            )}
            onSelectToday={() => setDraft(
              applyDateDraftNow(props.draft, props.draft.active)
            )}
          />
        </div>

        <div className="mx-1.5 border-t border-divider py-2">
          <Menu
            submenuOpenPolicy='click'
            items={settingsItems}
            autoFocus={false}
          />
        </div>
      </div>
    </div>
  )
}
