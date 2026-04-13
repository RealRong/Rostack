import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  type RefObject
} from 'react'
import {
  scrollViewport,
  type ScrollNode
} from '@shared/dom'

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
  const targetNodeRef = useRef<ViewportTarget | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    const target = targetRef.current
    if (targetNodeRef.current === target) {
      return
    }

    cleanupRef.current?.()
    targetNodeRef.current = target
    cleanupRef.current = watchViewport(target, bump)
    bump()
  })

  useEffect(() => () => {
    cleanupRef.current?.()
    cleanupRef.current = null
    targetNodeRef.current = null
  }, [])

  return version
}
