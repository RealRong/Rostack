import {
  useEffect,
  useReducer,
  type RefObject
} from 'react'
import {
  scrollViewport,
  type ScrollNode
} from './scroll'

export type ViewportTarget = HTMLElement | Window

const isWindow = (
  target: ViewportTarget | null | undefined
): target is Window => (
  typeof Window !== 'undefined'
  && target instanceof Window
)

const viewportNode = (
  target: ViewportTarget | null | undefined
): ScrollNode | null => {
  if (!target) {
    return null
  }

  if (isWindow(target)) {
    return target
  }

  return scrollViewport(target)?.node
    ?? target.ownerDocument?.defaultView
    ?? null
}

export const watchViewport = (
  target: ViewportTarget | null | undefined,
  listener: () => void
) => {
  const node = viewportNode(target)
  if (!node || typeof window === 'undefined') {
    return () => {}
  }

  node.addEventListener?.('scroll', listener, { passive: true })
  window.addEventListener('resize', listener, { passive: true })

  return () => {
    node.removeEventListener?.('scroll', listener)
    window.removeEventListener('resize', listener)
  }
}

export const useViewportVersion = <TTarget extends ViewportTarget>(
  targetRef: RefObject<TTarget | null>
) => {
  const [version, bump] = useReducer((value: number) => value + 1, 0)

  useEffect(() => watchViewport(targetRef.current, bump), [targetRef])

  return version
}
