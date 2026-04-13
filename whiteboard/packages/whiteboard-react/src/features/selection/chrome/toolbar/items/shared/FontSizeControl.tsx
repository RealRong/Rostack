import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent
} from 'react'
import {
  ChevronDown,
  ChevronUp
} from 'lucide-react'

const FONT_SIZE_MIN = 8
const FONT_SIZE_MAX = 288

const preventPointerDown = (
  event: PointerEvent<HTMLButtonElement>
) => {
  event.preventDefault()
  event.stopPropagation()
}

const clampFontSize = (
  value: number
) => Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))

export const FontSizeControl = ({
  value,
  onTogglePanel,
  onCommit,
  registerAnchor
}: {
  value?: number
  onTogglePanel: () => void
  onCommit: (value: number) => void
  registerAnchor: (element: HTMLElement | null) => void
}) => {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [draft, setDraft] = useState(value === undefined ? '' : `${value}`)

  useEffect(() => {
    setDraft(value === undefined ? '' : `${value}`)
  }, [value])

  useEffect(() => {
    registerAnchor(anchorRef.current)
  }, [registerAnchor])

  const parsed = useMemo(() => {
    if (!draft.trim()) {
      return undefined
    }

    const next = Number(draft)
    return Number.isFinite(next)
      ? clampFontSize(next)
      : undefined
  }, [draft])

  const commit = () => {
    if (parsed === undefined) {
      setDraft(value === undefined ? '' : `${value}`)
      return
    }

    onCommit(parsed)
  }

  const step = (
    delta: number
  ) => {
    const next = clampFontSize((parsed ?? value ?? 16) + delta)
    setDraft(`${next}`)
    onCommit(next)
  }

  return (
    <div
      ref={anchorRef}
      className="inline-flex h-9 items-stretch overflow-hidden bg-transparent"
    >
      <button
        type="button"
        className="flex w-12 items-center justify-center text-sm font-semibold text-fg outline-none"
        onPointerDown={preventPointerDown}
        onClick={onTogglePanel}
        title="Font size"
        aria-label="Font size"
      >
        <input
          value={draft}
          inputMode="numeric"
          placeholder={value === undefined ? 'Mixed' : undefined}
          className="w-full border-0 bg-transparent p-0 text-center text-sm font-semibold text-fg outline-none focus:outline-none"
          onPointerDown={(event) => {
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            onTogglePanel()
          }}
          onChange={(event) => {
            const next = event.target.value
            if (next === '' || /^\d+$/.test(next)) {
              setDraft(next)
            }
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commit()
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(value === undefined ? '' : `${value}`)
              event.currentTarget.blur()
              return
            }

            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              step(event.key === 'ArrowUp' ? 1 : -1)
            }
          }}
        />
      </button>
      <div className="flex w-6 flex-col">
        <button
          type="button"
          className="flex h-1/2 items-center justify-center text-fg-muted transition-colors hover:bg-pressed hover:text-fg"
          onPointerDown={preventPointerDown}
          onClick={(event) => {
            event.stopPropagation()
            step(1)
          }}
          aria-label="Increase font size"
          title="Increase font size"
        >
          <ChevronUp size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className="flex h-1/2 items-center justify-center text-fg-muted transition-colors hover:bg-pressed hover:text-fg"
          onPointerDown={preventPointerDown}
          onClick={(event) => {
            event.stopPropagation()
            step(-1)
          }}
          aria-label="Decrease font size"
          title="Decrease font size"
        >
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
