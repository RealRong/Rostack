import * as React from 'react'
import { cn } from '#ui/utils'

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.min(max, Math.max(min, value))

const roundToStep = (
  value: number,
  min: number,
  step: number
) => {
  const steps = Math.round((value - min) / step)
  return min + steps * step
}

export type SliderMark = {
  value: number
  label?: string
}

export interface SliderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value?: number
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  marks?: readonly SliderMark[]
  formatValue?: (value: number) => string
  size?: 'sm' | 'md'
  onValueChange?: (value: number) => void
  onValueCommit?: (value: number) => void
}

export const Slider = React.forwardRef<HTMLDivElement, SliderProps>(
  ({
    value,
    defaultValue,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    marks,
    formatValue,
    size = 'md',
    className,
    onValueChange,
    onValueCommit,
    onPointerDown,
    onKeyDown,
    ...props
  }, ref) => {
    const isControlled = value !== undefined
    const trackRef = React.useRef<HTMLDivElement | null>(null)
    const pointerValueRef = React.useRef<number | null>(null)
    const [uncontrolledValue, setUncontrolledValue] = React.useState(
      clamp(defaultValue ?? min, min, max)
    )

    const resolvedValue = clamp(
      isControlled ? value : uncontrolledValue,
      min,
      max
    )
    const commitValue = React.useCallback((next: number) => {
      if (!isControlled) {
        setUncontrolledValue(next)
      }
      onValueChange?.(next)
    }, [isControlled, onValueChange])

    const normalizeValue = React.useCallback((next: number) => {
      if (max <= min) {
        return min
      }

      const safeStep = step > 0 ? step : 1
      return clamp(roundToStep(next, min, safeStep), min, max)
    }, [max, min, step])

    const readValueFromClientX = React.useCallback((clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0) {
        return resolvedValue
      }

      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
      return normalizeValue(min + ratio * (max - min))
    }, [max, min, normalizeValue, resolvedValue])

    const updateFromClientX = React.useCallback((clientX: number) => {
      const next = readValueFromClientX(clientX)
      pointerValueRef.current = next
      commitValue(next)
      return next
    }, [commitValue, readValueFromClientX])

    const displayValue = formatValue
      ? formatValue(resolvedValue)
      : `${resolvedValue}`
    const ratio = max <= min
      ? 0
      : (resolvedValue - min) / (max - min)
    const thumbOffset = `${ratio * 100}%`
    const mergedRef = React.useMemo(
      () => (node: HTMLDivElement | null) => {
        trackRef.current = node
        if (typeof ref === 'function') {
          ref(node)
          return
        }
        if (ref) {
          ref.current = node
        }
      },
      [ref]
    )

    return (
      <div
        className={cn('flex flex-col gap-2', className)}
        {...props}
      >
        <div
          ref={mergedRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={resolvedValue}
          aria-valuetext={displayValue}
          className={cn(
            'relative select-none touch-none outline-none',
            disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
            size === 'sm' ? 'h-5' : 'h-6'
          )}
          onPointerDown={(event) => {
            onPointerDown?.(event)
            if (event.defaultPrevented || disabled) {
              return
            }

            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.focus()
            event.currentTarget.setPointerCapture(event.pointerId)
            updateFromClientX(event.clientX)
          }}
          onPointerMove={(event) => {
            if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) {
              return
            }

            event.preventDefault()
            updateFromClientX(event.clientX)
          }}
          onPointerUp={(event) => {
            if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) {
              return
            }

            const next = updateFromClientX(event.clientX)
            event.currentTarget.releasePointerCapture(event.pointerId)
            pointerValueRef.current = null
            onValueCommit?.(next)
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event)
            if (event.defaultPrevented || disabled) {
              return
            }

            let next: number | null = null
            switch (event.key) {
              case 'ArrowLeft':
              case 'ArrowDown':
                next = normalizeValue(resolvedValue - step)
                break
              case 'ArrowRight':
              case 'ArrowUp':
                next = normalizeValue(resolvedValue + step)
                break
              case 'Home':
                next = min
                break
              case 'End':
                next = max
                break
              case 'PageDown':
                next = normalizeValue(resolvedValue - step * 10)
                break
              case 'PageUp':
                next = normalizeValue(resolvedValue + step * 10)
                break
              default:
                return
            }

            event.preventDefault()
            commitValue(next)
            onValueCommit?.(next)
          }}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-strong" />
          <div
            className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
            style={{
              width: thumbOffset
            }}
          />
          {marks?.length ? (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-0.5">
              {marks.map((mark) => {
                const markRatio = max <= min
                  ? 0
                  : clamp((mark.value - min) / (max - min), 0, 1)

                return (
                  <span
                    key={`${mark.value}:${mark.label ?? ''}`}
                    className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-default bg-floating"
                    style={{
                      left: `${markRatio * 100}%`
                    }}
                  />
                )
              })}
            </div>
          ) : null}
          <div
            className={cn(
              'absolute top-1/2 rounded-full border border-default bg-white transition-[transform,box-shadow] duration-150',
              disabled ? '' : 'group-focus-within:shadow-sm',
              size === 'sm' ? 'h-3.5 w-3.5 -translate-y-1/2' : 'h-4 w-4 -translate-y-1/2'
            )}
            style={{
              left: thumbOffset,
              transform: 'translate(-50%, -50%)'
            }}
          />
        </div>
      </div>
    )
  }
)

Slider.displayName = 'Slider'
