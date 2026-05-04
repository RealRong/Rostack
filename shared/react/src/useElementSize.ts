import {
  useEffect,
  useState,
  type RefObject
} from 'react'
import {
  observeElementSize,
  type ElementSize
} from '@shared/dom'

const EmptySize: ElementSize = {
  width: 0,
  height: 0
}

const CachedSizeByElement = new WeakMap<HTMLElement, ElementSize>()

export const useElementSize = <ElementType extends HTMLElement>(
  ref: RefObject<ElementType | null>
) => {
  const [size, setSize] = useState<ElementSize>(EmptySize)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      setSize(EmptySize)
      return
    }

    const cached = CachedSizeByElement.get(element)
    if (cached) {
      setSize(current => (
        current.width === cached.width
        && current.height === cached.height
          ? current
          : cached
      ))
    }

    return observeElementSize(element, {
      emitInitial: cached === undefined,
      onChange: next => {
        CachedSizeByElement.set(element, next)
        setSize(current => (
          current.width === next.width
          && current.height === next.height
            ? current
            : next
        ))
      }
    })
  }, [ref])

  return size
}
