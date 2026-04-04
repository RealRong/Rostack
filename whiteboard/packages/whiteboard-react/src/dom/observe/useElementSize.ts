import {
  useEffect,
  useState,
  type RefObject
} from 'react'
import type { Size } from '../../types/common/base'

const EmptySize: Size = {
  width: 0,
  height: 0
}

const readElementSize = (
  element: HTMLElement | null
): Size => ({
  width: element?.clientWidth ?? 0,
  height: element?.clientHeight ?? 0
})

export const useElementSize = (
  ref: RefObject<HTMLElement | null>
) => {
  const [size, setSize] = useState<Size>(EmptySize)

  useEffect(() => {
    const element = ref.current

    const update = () => {
      const next = readElementSize(element)
      setSize((current) => (
        current.width === next.width
        && current.height === next.height
          ? current
          : next
      ))
    }

    update()

    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(update)
    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [ref])

  return size
}
