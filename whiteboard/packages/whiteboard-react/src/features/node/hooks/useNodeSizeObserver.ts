import { useCallback, useEffect, useMemo } from 'react'
import type { NodeId } from '@whiteboard/core/types'
import {
  createRafTask,
  type RafTask
} from '@whiteboard/engine'
import { useEditor } from '../../../runtime/hooks/useEditor'

type Size = {
  width: number
  height: number
}

type NodeSizeObserverState = {
  observer: ResizeObserver | null
  elementByNodeId: Map<NodeId, HTMLDivElement>
  nodeByElement: WeakMap<Element, NodeId>
  pendingSizeById: Map<NodeId, Size>
  lastSizeById: Map<NodeId, Size>
  flushTask: RafTask
  registerMeasuredElement: (
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => void
}

const SIZE_EPSILON = 0.5

const isSameSize = (a: Size, b: Size) =>
  Math.abs(a.width - b.width) < SIZE_EPSILON
  && Math.abs(a.height - b.height) < SIZE_EPSILON

const isValidSize = (size: Size) =>
  Number.isFinite(size.width)
  && Number.isFinite(size.height)
  && size.width > 0
  && size.height > 0

const readElementSize = (element: Element): Size => {
  const rect = element.getBoundingClientRect()
  return {
    width: rect.width,
    height: rect.height
  }
}

const readEntrySize = (entry: ResizeObserverEntry): Size => {
  const borderBoxSize = Array.isArray(entry.borderBoxSize)
    ? entry.borderBoxSize[0]
    : entry.borderBoxSize

  return {
    width: borderBoxSize?.inlineSize ?? entry.contentRect.width,
    height: borderBoxSize?.blockSize ?? entry.contentRect.height
  }
}

export const useNodeSizeObserver = () => {
  const editor = useEditor()

  const state = useMemo(() => {
    let nextState!: NodeSizeObserverState

    const queueMeasure = (nodeId: NodeId, size: Size) => {
      if (!isValidSize(size)) return
      nextState.pendingSizeById.set(nodeId, size)
      nextState.flushTask.schedule()
    }

    const flushMeasures = () => {
      if (!nextState.pendingSizeById.size) return

      const updates: Array<{ id: NodeId; update: { fields: { size: Size } } }> = []

      nextState.pendingSizeById.forEach((size, nodeId) => {
        const current = editor.read.index.node.get(nodeId)
        if (!current || !isValidSize(size)) return

        const committedSize = {
          width: current.rect.width,
          height: current.rect.height
        }
        if (isSameSize(committedSize, size)) {
          nextState.lastSizeById.set(nodeId, size)
          return
        }

        const lastSize = nextState.lastSizeById.get(nodeId)
        if (lastSize && isSameSize(lastSize, size)) {
          return
        }

        nextState.lastSizeById.set(nodeId, size)
        updates.push({
          id: nodeId,
          update: {
            fields: { size }
          }
        })
      })
      nextState.pendingSizeById.clear()

      if (!updates.length) return
      editor.commands.node.document.updateMany(updates, { origin: 'system' })
    }

    nextState = {
      observer: null,
      elementByNodeId: new Map<NodeId, HTMLDivElement>(),
      nodeByElement: new WeakMap<Element, NodeId>(),
      pendingSizeById: new Map<NodeId, Size>(),
      lastSizeById: new Map<NodeId, Size>(),
      registerMeasuredElement: (
        nodeId: NodeId,
        element: HTMLDivElement | null,
        enabled: boolean
      ) => {
        const previousElement = nextState.elementByNodeId.get(nodeId)

        if (previousElement && nextState.observer) {
          nextState.observer.unobserve(previousElement)
        }

        if (previousElement) {
          nextState.nodeByElement.delete(previousElement)
        }

        if (!element || !enabled) {
          nextState.elementByNodeId.delete(nodeId)
          nextState.pendingSizeById.delete(nodeId)
          nextState.lastSizeById.delete(nodeId)
          return
        }

        nextState.elementByNodeId.set(nodeId, element)
        nextState.nodeByElement.set(element, nodeId)

        if (nextState.observer) {
          nextState.observer.observe(element)
        }
        queueMeasure(nodeId, readElementSize(element))
      },
      flushTask: createRafTask(flushMeasures, { fallback: 'microtask' })
    }

    if (typeof ResizeObserver !== 'undefined') {
      nextState.observer = new ResizeObserver((entries) => {
        entries.forEach((entry) => {
          const nodeId = nextState.nodeByElement.get(entry.target)
          if (!nodeId) return
          queueMeasure(nodeId, readEntrySize(entry))
        })
      })
    }

    return nextState
  }, [editor])

  useEffect(() => () => {
    state.flushTask.cancel()
    state.observer?.disconnect()
    state.elementByNodeId.clear()
    state.pendingSizeById.clear()
    state.lastSizeById.clear()
  }, [state])

  return useCallback((
    nodeId: NodeId,
    element: HTMLDivElement | null,
    enabled: boolean
  ) => {
    state.registerMeasuredElement(nodeId, element, enabled)
  }, [state])
}
