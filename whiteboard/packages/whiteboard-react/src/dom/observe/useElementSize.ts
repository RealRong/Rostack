import {
  useEffect,
  useState,
  type RefObject
} from 'react'
import {
  observeElementSize,
  readElementClientSize
} from '@shared/dom'
import type { Size } from '../../types/common/base'

const EmptySize: Size = {
  width: 0,
  height: 0
}

export const useElementSize = (
  ref: RefObject<HTMLElement | null>
) => {
  const [size, setSize] = useState<Size>(EmptySize)

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
