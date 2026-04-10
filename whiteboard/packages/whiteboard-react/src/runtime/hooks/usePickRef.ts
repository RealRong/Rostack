import { useCallback, useEffect, useRef } from 'react'
import type { EditorPick } from '@whiteboard/editor'
import { useWhiteboardServices } from './useWhiteboard'

const toPickKey = (
  pick: EditorPick
) => {
  switch (pick.kind) {
    case 'background':
      return 'background'
    case 'group':
      return [
        'group',
        pick.id,
        pick.part
      ].join(':')
    case 'selection-box':
      return [
        'selection-box',
        pick.part,
        pick.handle?.id ?? '',
        pick.handle?.direction ?? ''
      ].join(':')
    case 'node':
      if (pick.part === 'field') {
        return [
          'node',
          pick.id,
          pick.part,
          pick.field
        ].join(':')
      }

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
        pick.labelId ?? '',
        pick.end ?? '',
        pick.index ?? '',
        pick.insert ?? '',
        pick.segment ?? ''
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
  const { pointer } = useWhiteboardServices()
  const elementRef = useRef<Element | null>(null)
  const releaseRef = useRef<(() => void) | null>(null)
  const pickRef = useRef(pick)
  const key = toPickKey(pick)

  useEffect(() => {
    pickRef.current = pick
  }, [key, pick])

  const bind = useCallback((element: Element | null) => {
    if (elementRef.current === element) {
      return
    }

    releaseRef.current?.()
    releaseRef.current = null
    elementRef.current = element

    if (element) {
      releaseRef.current = pointer.bindPick(element, pickRef.current)
    }
  }, [key, pointer])

  useEffect(() => {
    const element = elementRef.current
    if (!element) {
      return
    }

    releaseRef.current?.()
    releaseRef.current = pointer.bindPick(element, pickRef.current)

    return () => {
      releaseRef.current?.()
      releaseRef.current = null
    }
  }, [key, pointer])

  return bind
}
