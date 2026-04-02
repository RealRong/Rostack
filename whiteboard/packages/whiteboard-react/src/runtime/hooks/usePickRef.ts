import { useCallback, useEffect, useRef } from 'react'
import type { EditorPick } from '@whiteboard/editor'
import { useHostRuntime } from './useHost'

const toPickKey = (
  pick: EditorPick
) => {
  switch (pick.kind) {
    case 'background':
      return 'background'
    case 'selection-box':
      return [
        'selection-box',
        pick.part,
        pick.handle?.id ?? '',
        pick.handle?.direction ?? ''
      ].join(':')
    case 'node':
      return [
        'node',
        pick.id,
        pick.part,
        pick.handle?.id ?? '',
        pick.side ?? ''
      ].join(':')
    case 'edge':
      return [
        'edge',
        pick.id,
        pick.part,
        pick.end ?? '',
        pick.index ?? '',
        pick.insert ?? ''
      ].join(':')
    case 'mindmap':
      return [
        'mindmap',
        pick.treeId,
        pick.nodeId
      ].join(':')
  }
}

export const usePickRef = (
  pick: EditorPick
) => {
  const host = useHostRuntime()
  const elementRef = useRef<Element | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const key = toPickKey(pick)

  const bind = useCallback((element: Element | null) => {
    if (elementRef.current === element) {
      return
    }

    releaseRef.current?.()
    releaseRef.current = null
    elementRef.current = element

    if (element) {
      releaseRef.current = host.pick.bind(element, pick)
    }
  }, [host, key])

  useEffect(() => {
    const element = elementRef.current
    if (!element) {
      return
    }

    releaseRef.current?.()
    releaseRef.current = host.pick.bind(element, pick)

    return () => {
      releaseRef.current?.()
      releaseRef.current = null
    }
  }, [host, key])

  return bind
}
