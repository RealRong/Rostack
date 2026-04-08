import {
  useEffect,
  useState,
  type RefObject
} from 'react'
import {
  observeElementSize,
  readElementClientSize,
  type ElementSize
} from '@shared/dom'

const EmptySize: ElementSize = {
  width: 0,
  height: 0
}

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

    return observeElementSize(element, {
      readInitialSize: readElementClientSize,
      readEntrySize: (_entry, target) => readElementClientSize(target),
      onChange: next => {
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
