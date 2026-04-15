import { createRafTask } from '@shared/core'

export interface ElementSize {
  width: number
  height: number
}

export type ElementSizeEquality = (
  left: ElementSize,
  right: ElementSize
) => boolean

export type ElementMeasureSchedule = 'sync' | 'microtask' | 'raf'

export type ReadElementSize<ElementType extends Element> = (
  element: ElementType
) => ElementSize

export type ReadResizeEntrySize<ElementType extends Element> = (
  entry: ResizeObserverEntry,
  element: ElementType
) => ElementSize

export interface ObservedElementChange<Key, ElementType extends Element> {
  key: Key
  element: ElementType
  size: ElementSize
}

export interface ObserveElementSizeOptions<ElementType extends Element> {
  emitInitial?: boolean
  isEqual?: ElementSizeEquality
  readEntrySize?: ReadResizeEntrySize<ElementType>
  readInitialSize?: ReadElementSize<ElementType>
  onChange: (size: ElementSize, element: ElementType) => void
}

export interface MeasuredElementObserverOptions<Key, ElementType extends Element> {
  debugName?: string
  emitInitial?: boolean
  isEqual?: ElementSizeEquality
  readEntrySize?: ReadResizeEntrySize<ElementType>
  readInitialSize?: ReadElementSize<ElementType>
  schedule?: ElementMeasureSchedule
  onChange: (changes: readonly ObservedElementChange<Key, ElementType>[]) => void
}

export interface MeasuredElementObserver<Key, ElementType extends Element> {
  disconnect(): void
  observe(key: Key, element: ElementType): void
  unobserve(key: Key): void
}

const sameSize = (
  left: ElementSize,
  right: ElementSize
) => left.width === right.width && left.height === right.height

const createScheduleTask = (
  flush: () => void,
  schedule: ElementMeasureSchedule,
  debugName?: string
) => {
  if (schedule === 'raf') {
    return createRafTask(flush, {
      fallback: 'microtask'
    })
  }

  if (schedule === 'microtask') {
    let queued = false
    let token = 0

    return {
      cancel: () => {
        queued = false
        token += 1
      },
      schedule: () => {
        if (queued) {
          return
        }

        queued = true
        const currentToken = token + 1
        token = currentToken

        const runMicrotask = debugName
          ? ({
              [debugName]: () => {
                if (!queued || currentToken !== token) {
                  return
                }

                queued = false
                flush()
              }
            })[debugName]!
          : function runMeasuredElementObserverMicrotask() {
              if (!queued || currentToken !== token) {
                return
              }

              queued = false
              flush()
            }

        queueMicrotask(runMicrotask)
      }
    }
  }

  return {
    cancel: () => {},
    schedule: flush
  }
}

export const readElementRectSize = <ElementType extends Element>(
  element: ElementType
): ElementSize => {
  const rect = element.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height
  }
}

export const readElementClientSize = <ElementType extends HTMLElement>(
  element: ElementType
): ElementSize => ({
  width: element.clientWidth,
  height: element.clientHeight
})

export const readResizeObserverEntrySize = <ElementType extends Element>(
  entry: ResizeObserverEntry,
  element: ElementType
): ElementSize => {
  const borderBoxSize = Array.isArray(entry.borderBoxSize)
    ? entry.borderBoxSize[0]
    : entry.borderBoxSize

  if (borderBoxSize) {
    return {
      width: borderBoxSize.inlineSize,
      height: borderBoxSize.blockSize
    }
  }

  const contentRect = entry.contentRect
  if (contentRect) {
    return {
      width: contentRect.width,
      height: contentRect.height
    }
  }

  return readElementRectSize(element)
}

export const observeElementSize = <ElementType extends Element>(
  element: ElementType,
  options: ObserveElementSizeOptions<ElementType>
): (() => void) => {
  const readInitialSize = options.readInitialSize ?? readElementRectSize<ElementType>
  const readEntrySize = options.readEntrySize ?? readResizeObserverEntrySize<ElementType>
  const isEqual = options.isEqual ?? sameSize
  let currentSize: ElementSize | undefined

  const emit = (nextSize: ElementSize) => {
    if (currentSize && isEqual(currentSize, nextSize)) {
      return
    }

    currentSize = nextSize
    options.onChange(nextSize, element)
  }

  if (options.emitInitial ?? true) {
    emit(readInitialSize(element))
  }

  if (typeof ResizeObserver === 'undefined') {
    return () => {}
  }

  const observer = new ResizeObserver(entries => {
    entries.forEach(entry => {
      if (entry.target !== element) {
        return
      }

      emit(readEntrySize(entry, element))
    })
  })

  observer.observe(element)
  return () => {
    observer.disconnect()
  }
}

export const createMeasuredElementObserver = <Key, ElementType extends Element>(
  options: MeasuredElementObserverOptions<Key, ElementType>
): MeasuredElementObserver<Key, ElementType> => {
  const elementByKey = new Map<Key, ElementType>()
  const keyByElement = new WeakMap<Element, Key>()
  const pendingByKey = new Map<Key, ObservedElementChange<Key, ElementType>>()
  const lastSizeByKey = new Map<Key, ElementSize>()
  const readInitialSize = options.readInitialSize ?? readElementRectSize<ElementType>
  const readEntrySize = options.readEntrySize ?? readResizeObserverEntrySize<ElementType>
  const isEqual = options.isEqual ?? sameSize

  const flush = () => {
    if (!pendingByKey.size) {
      return
    }

    const changes = Array.from(pendingByKey.values())
    pendingByKey.clear()
    changes.forEach(change => {
      lastSizeByKey.set(change.key, change.size)
    })
    options.onChange(changes)
  }

  const flushTask = createScheduleTask(
    flush,
    options.schedule ?? 'sync',
    options.debugName
  )

  const queueChange = (
    key: Key,
    element: ElementType,
    size: ElementSize
  ) => {
    const previous = pendingByKey.get(key)?.size ?? lastSizeByKey.get(key)
    if (previous && isEqual(previous, size)) {
      return
    }

    pendingByKey.set(key, {
      key,
      element,
      size
    })
    flushTask.schedule()
  }

  const observer = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(entries => {
      entries.forEach(entry => {
        const element = entry.target as ElementType
        const key = keyByElement.get(element)
        if (key === undefined) {
          return
        }

        queueChange(key, element, readEntrySize(entry, element))
      })
    })

  const unobserve = (key: Key) => {
    const previousElement = elementByKey.get(key)
    if (!previousElement) {
      pendingByKey.delete(key)
      lastSizeByKey.delete(key)
      return
    }

    observer?.unobserve(previousElement)
    keyByElement.delete(previousElement)
    elementByKey.delete(key)
    pendingByKey.delete(key)
    lastSizeByKey.delete(key)
  }

  return {
    disconnect: () => {
      flushTask.cancel()
      observer?.disconnect()
      elementByKey.clear()
      pendingByKey.clear()
      lastSizeByKey.clear()
    },
    observe: (key, element) => {
      const previousElement = elementByKey.get(key)
      if (previousElement && previousElement !== element) {
        observer?.unobserve(previousElement)
        keyByElement.delete(previousElement)
      }

      elementByKey.set(key, element)
      keyByElement.set(element, key)
      observer?.observe(element)

      if (options.emitInitial ?? true) {
        queueChange(key, element, readInitialSize(element))
      }
    },
    unobserve
  }
}
