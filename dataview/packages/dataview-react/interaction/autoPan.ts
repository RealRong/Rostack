import {
  useEffect,
  useMemo,
  type MutableRefObject
} from 'react'
import {
  pageScrollNode,
  resolveEdgePressure,
  scrollByClamped,
  viewportRect,
  type ScrollNode
} from '@shared/dom'

const DEFAULT_AUTO_PAN_EDGE = 96
const DEFAULT_AUTO_PAN_MAX_STEP = 22

export interface AutoPanAxis {
  node: ScrollNode
  edge?: number
  maxStep?: number
}

export interface AutoPanTargets {
  x?: AutoPanAxis | null
  y?: AutoPanAxis | null
}

export interface PointerLike {
  x: number
  y: number
}

export const resolveAutoPanStep = (
  pressure: number,
  maxStep: number
) => Math.round(Math.abs(pressure) * maxStep) * Math.sign(pressure)

export const resolveAutoPanDelta = (input: {
  pointer: number
  start: number
  end: number
  edge?: number
  maxStep?: number
}) => {
  const edge = input.edge ?? DEFAULT_AUTO_PAN_EDGE
  const maxStep = input.maxStep ?? DEFAULT_AUTO_PAN_MAX_STEP
  return resolveAutoPanStep(resolveEdgePressure({
    point: input.pointer,
    start: input.start,
    end: input.end,
    threshold: edge
  }), maxStep)
}

export const resolveDefaultAutoPanTargets = (
  container: HTMLElement | null | undefined
): AutoPanTargets | null => {
  if (!container) {
    return null
  }

  return {
    x: {
      node: container
    },
    y: (() => {
      const node = pageScrollNode(container)
      return node
        ? {
            node
          }
        : null
    })()
  }
}

export const autoPanNodes = (
  targets: AutoPanTargets | null | undefined
): readonly ScrollNode[] => {
  const result: ScrollNode[] = []
  const seen = new Set<ScrollNode>()

  ;[targets?.x?.node, targets?.y?.node].forEach(node => {
    if (!node || seen.has(node)) {
      return
    }

    seen.add(node)
    result.push(node)
  })

  return result
}

export const useAutoPan = (options: {
  active: boolean
  pointerRef: MutableRefObject<PointerLike | null>
  resolveTargets: () => AutoPanTargets | null
  onPan?: () => void
}) => {
  const {
    active,
    pointerRef,
    resolveTargets,
    onPan
  } = options
  const targets = resolveTargets()
  const xNode = targets?.x?.node ?? null
  const yNode = targets?.y?.node ?? null
  const watchTargets = useMemo(
    () => autoPanNodes(targets),
    [xNode, yNode]
  )

  useEffect(() => {
    if (!active || typeof window === 'undefined') {
      return
    }

    let frame = 0

    const tick = () => {
      const pointer = pointerRef.current
      const resolved = resolveTargets()
      if (pointer && resolved) {
        const nodeDelta = new Map<ScrollNode, {
          left: number
          top: number
        }>()
        const pushDelta = (
          node: ScrollNode,
          axis: 'left' | 'top',
          value: number
        ) => {
          if (!value) {
            return
          }

          const current = nodeDelta.get(node) ?? {
            left: 0,
            top: 0
          }
          current[axis] += value
          nodeDelta.set(node, current)
        }

        if (resolved.x?.node) {
          const rect = viewportRect(resolved.x.node)
          pushDelta(
            resolved.x.node,
            'left',
            resolveAutoPanDelta({
              pointer: pointer.x,
              start: rect.left,
              end: rect.right,
              edge: resolved.x.edge,
              maxStep: resolved.x.maxStep
            })
          )
        }

        if (resolved.y?.node) {
          const rect = viewportRect(resolved.y.node)
          pushDelta(
            resolved.y.node,
            'top',
            resolveAutoPanDelta({
              pointer: pointer.y,
              start: rect.top,
              end: rect.bottom,
              edge: resolved.y.edge,
              maxStep: resolved.y.maxStep
            })
          )
        }

        let moved = false
        nodeDelta.forEach((delta, node) => {
          const next = scrollByClamped({
            node,
            left: delta.left,
            top: delta.top
          })
          moved = moved || Boolean(next.left || next.top)
        })

        if (moved) {
          onPan?.()
        }
      }

      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [active, onPan, pointerRef, resolveTargets, xNode, yNode])

  return {
    watchTargets
  }
}
