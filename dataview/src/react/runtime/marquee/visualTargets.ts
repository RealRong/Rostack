import type { AppearanceId } from '@dataview/react/runtime/currentView'
import {
  scrollMetrics,
  type ScrollNode
} from '@shared/dom'
import type {
  AutoPanTargets
} from '@dataview/react/interaction/autoPan'
import type { SelectionTarget } from './types'
import { selectionTargetFromElement } from './dom'

interface SnapshotScrollAnchor {
  node: ScrollNode
  start: number
}

interface FrozenSnapshot {
  target: SelectionTarget
  scroll: {
    x?: SnapshotScrollAnchor
    y?: SnapshotScrollAnchor
  }
}

export interface VisualTargetRegistry {
  node(id: AppearanceId): HTMLElement | null
  nodes(ids: readonly AppearanceId[]): readonly HTMLElement[]
  register(id: AppearanceId, node: HTMLElement | null): void
  freeze(id: AppearanceId, node: HTMLElement): void
  clearFrozen(): void
  getTargets(order: readonly AppearanceId[]): readonly SelectionTarget[]
}

const readScrollAnchor = (
  targets: AutoPanTargets | null | undefined
): FrozenSnapshot['scroll'] => ({
  x: targets?.x?.node
    ? {
        node: targets.x.node,
        start: scrollMetrics(targets.x.node).left
      }
    : undefined,
  y: targets?.y?.node
    ? {
        node: targets.y.node,
        start: scrollMetrics(targets.y.node).top
      }
    : undefined
})

const projectFrozenTarget = (snapshot: FrozenSnapshot): SelectionTarget => {
  const leftDelta = snapshot.scroll.x
    ? scrollMetrics(snapshot.scroll.x.node).left - snapshot.scroll.x.start
    : 0
  const topDelta = snapshot.scroll.y
    ? scrollMetrics(snapshot.scroll.y.node).top - snapshot.scroll.y.start
    : 0
  const rect = {
    left: snapshot.target.rect.left - leftDelta,
    top: snapshot.target.rect.top - topDelta,
    right: snapshot.target.rect.right - leftDelta,
    bottom: snapshot.target.rect.bottom - topDelta
  } as SelectionTarget['rect'] & {
    width?: number
    height?: number
  }
  const sourceRect = snapshot.target.rect as SelectionTarget['rect'] & {
    width?: number
    height?: number
  }

  if ('width' in sourceRect) {
    rect.width = sourceRect.width
  }
  if ('height' in sourceRect) {
    rect.height = sourceRect.height
  }

  return {
    id: snapshot.target.id,
    rect
  }
}

export const createVisualTargetRegistry = (options?: {
  resolveScrollTargets?: () => AutoPanTargets | null
  freezeSnapshot?: (id: AppearanceId, node: HTMLElement) => unknown
  projectSnapshot?: (snapshot: unknown) => SelectionTarget
}): VisualTargetRegistry => {
  const liveNodes = new Map<AppearanceId, HTMLElement>()
  const frozenTargets = new Map<AppearanceId, unknown>()

  return {
    node: id => liveNodes.get(id) ?? null,
    nodes: ids => ids.flatMap(id => {
      const node = liveNodes.get(id)
      return node ? [node] : []
    }),
    register: (id, node) => {
      if (!node) {
        liveNodes.delete(id)
        return
      }

      frozenTargets.delete(id)
      liveNodes.set(id, node)
    },
    freeze: (id, node) => {
      frozenTargets.set(
        id,
        options?.freezeSnapshot?.(id, node) ?? {
          target: selectionTargetFromElement(id, node),
          scroll: readScrollAnchor(options?.resolveScrollTargets?.())
        } satisfies FrozenSnapshot
      )
    },
    clearFrozen: () => {
      frozenTargets.clear()
    },
    getTargets: order => {
      const targets: SelectionTarget[] = []

      order.forEach(id => {
        const liveNode = liveNodes.get(id)
        if (liveNode) {
          targets.push(selectionTargetFromElement(id, liveNode))
          return
        }

        const frozenTarget = frozenTargets.get(id)
        if (frozenTarget) {
          targets.push(
            options?.projectSnapshot?.(frozenTarget)
            ?? projectFrozenTarget(frozenTarget as FrozenSnapshot)
          )
        }
      })

      return targets
    }
  }
}
