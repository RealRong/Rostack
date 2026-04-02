import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject
} from 'react'
import {
  formatTimeZoneLabel,
  type DateDisplayFormat,
  type DateTimeFormat,
  getAvailableTimezones,
  getDatePropertyConfig,
  resolveDefaultDateTimezone
} from '@dataview/core/property'
import { useEngine } from '@dataview/react/editor'
import { meta, renderMessage } from '@dataview/meta'
import {
  Input,
  Menu,
  cn,
  type MenuItem
} from '@dataview/react/ui'
import type { PropertyValueDraftEditorProps } from '../../contracts'
import { focusInputWithoutScroll } from '@dataview/react/dom/focus'
import { isComposing } from '../../shared/keyboard'
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
  props: PropertyValueDraftEditorProps<DateValueDraft>
) => {
  const editor = useEngine()
  const startDateRef = useRef<HTMLInputElement | null>(null)
  const property = props.property?.kind === 'date'
    ? props.property
    : undefined
  const dateConfig = getDatePropertyConfig(property)
  const displayDateFormat = meta.property.date.displayDateFormat.get(dateConfig.displayDateFormat)
  const displayTimeFormat = meta.property.date.displayTimeFormat.get(dateConfig.displayTimeFormat)
  const timezones = useMemo(
    () => getAvailableTimezones(),
    []
  )
  const defaultTimezone = resolveDefaultDateTimezone(props.property)
  const { commitDraft } = useDraftCommit({
    onDraftChange: props.onDraftChange,
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
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
      return
    }

    if (
      event.key === 'Enter'
      && !isComposing(event.nativeEvent)
      && !(event.target instanceof HTMLButtonElement)
      && !(event.target instanceof HTMLSelectElement)
    ) {
      event.preventDefault()
      event.stopPropagation()
      props.onCommit(props.enterIntent ?? 'done')
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

    editor.properties.update(property.id, {
      config: {
        ...dateConfig,
        ...patch
      }
    })
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
          items: meta.property.date.displayDateFormat.list.map(option => ({
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
          items: meta.property.date.displayTimeFormat.list.map(option => ({
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

        <div className="ui-divider-top py-2 mx-1.5">
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
