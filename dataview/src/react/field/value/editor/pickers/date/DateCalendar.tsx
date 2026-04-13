import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday as isCurrentDay,
  isValid,
  parse,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import {
  useEffect,
  useMemo,
  useState
} from 'react'
import { Button } from '@shared/ui/button'
import { cn } from '@shared/ui/utils'
import {
  readDateDraftBoundaryDate,
  type DateValueDraft
} from './DateValueDraft'

interface CalendarCell {
  date: string
  day: number
  inMonth: boolean
  isToday: boolean
}

const DATE_FORMAT = 'yyyy-MM-dd'
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const

const toDateString = (value: Date) => (
  format(value, DATE_FORMAT)
)

const parseDateString = (value: string) => {
  const parsed = parse(value, DATE_FORMAT, new Date(0))
  return isValid(parsed) && format(parsed, DATE_FORMAT) === value
    ? parsed
    : undefined
}

const createCalendarCells = (
  month: Date
): CalendarCell[] => {
  const monthStart = startOfMonth(month)
  const gridStart = startOfWeek(monthStart)
  const gridEnd = addDays(gridStart, 41)

  return eachDayOfInterval({
    start: gridStart,
    end: gridEnd
  }).map(current => {
    return {
      date: toDateString(current),
      day: Number(format(current, 'd')),
      inMonth: isSameMonth(current, monthStart),
      isToday: isCurrentDay(current)
    }
  })
}

const resolveRangeBounds = (draft: DateValueDraft) => {
  if (
    !draft.endEnabled
    || !parseDateString(draft.startDate)
    || !parseDateString(draft.endDate)
  ) {
    return undefined
  }

  return draft.startDate <= draft.endDate
    ? {
        start: draft.startDate,
        end: draft.endDate
      }
    : {
        start: draft.endDate,
        end: draft.startDate
      }
}

export const DateCalendar = (props: {
  draft: DateValueDraft
  onSelectDate: (date: string) => void
  onSelectToday: () => void
}) => {
  const activeDate = readDateDraftBoundaryDate(props.draft, props.draft.active)
  const [month, setMonth] = useState(() => (
    startOfMonth(
      parseDateString(activeDate)
      ?? parseDateString(props.draft.startDate)
      ?? new Date()
    )
  ))

  useEffect(() => {
    const selected = parseDateString(activeDate)
    if (!selected) {
      return
    }

    setMonth(prev => (
      prev.getFullYear() === selected.getFullYear()
      && prev.getMonth() === selected.getMonth()
        ? prev
        : startOfMonth(selected)
    ))
  }, [activeDate])

  const cells = useMemo(
    () => createCalendarCells(month),
    [month]
  )
  const range = resolveRangeBounds(props.draft)
  const monthLabel = format(month, 'MMMM yyyy')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {monthLabel}
        </div>
        <Button
          className='h-6'
          variant='ghost'
          onClick={props.onSelectToday}
        >
          {props.draft.kind === 'datetime' ? '现在' : '今天'}
        </Button>
        <Button
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonth(prev => addMonths(prev, -1))}
        >
          <ChevronLeft size={16} strokeWidth={1.8} />
        </Button>
        <Button
          size="icon"
          aria-label="Next month"
          onClick={() => setMonth(prev => addMonths(prev, 1))}
        >
          <ChevronRight size={16} strokeWidth={1.8} />
        </Button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAY_LABELS.map(label => (
          <div
            key={label}
            className="flex size-7 items-center justify-center text-sm font-medium text-muted-foreground"
          >
            {label}
          </div>
        ))}

        {cells.map(cell => {
          const isStart = cell.date === props.draft.startDate
          const isEnd = props.draft.endEnabled && cell.date === props.draft.endDate
          const isBoundary = isStart || isEnd
          const inRange = Boolean(
            !isBoundary
            && range
            && cell.date >= range.start
            && cell.date <= range.end
          )

          return (
            <div
              key={cell.date}
              className={cn(
                'flex size-7 items-center justify-center rounded-lg',
                inRange && 'bg-[var(--ui-control-hover)]'
              )}
            >
              <Button
                size="icon"
                variant={cell.inMonth ? 'ghost' : 'plain'}
                pressed={isBoundary}
                aria-pressed={isBoundary}
                aria-current={cell.isToday ? 'date' : undefined}
                onClick={() => props.onSelectDate(cell.date)}
              >
                <span className={cn(
                  'text-sm',
                  !cell.inMonth && 'opacity-35',
                  cell.isToday && !isBoundary && 'font-semibold'
                )}>
                  {cell.day}
                </span>
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
