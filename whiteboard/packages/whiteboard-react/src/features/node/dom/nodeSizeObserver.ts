import { useCallback, useEffect, useMemo } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import {
  createMeasuredElementObserver,
  type ElementSize
} from '@shared/dom'
import { useEditor } from '#react/runtime/hooks'

type Size = ElementSize

const SIZE_EPSILON = 0.5

const isSameSize = (a: Size, b: Size) =>
  Math.abs(a.width - b.width) < SIZE_EPSILON
  && Math.abs(a.height - b.height) < SIZE_EPSILON

const isValidSize = (size: Size) =>
  Number.isFinite(size.width)
  && Number.isFinite(size.height)
  && size.width > 0
  && size.height > 0

export const useNodeSizeObserver = () => {
  const editor = useEditor()

  const observer = useMemo(() => createMeasuredElementObserver<NodeId, HTMLDivElement>({
    isEqual: isSameSize,
    schedule: 'raf',
    onChange: changes => {
      changes.forEach(({ key: nodeId, size }) => {
        const current = editor.read.index.node.get(nodeId)
        if (!current || !isValidSize(size)) return

        const committedSize = {
          width: current.geometry.rect.width,
          height: current.geometry.rect.height
        }
        if (isSameSize(committedSize, size)) {
          return
        }

        editor.document.nodes.patch([nodeId], {
          fields: {
            size
          }
        }, {
          origin: 'system'
        })
      })
    }
  }), [editor])

  useEffect(() => () => {
    observer.disconnect()
  }, [observer])

  return useCallback((
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => {
    if (!element || !enabled) {
      observer.unobserve(nodeId)
      return
    }

    observer.observe(nodeId, element)
  }, [observer])
}
