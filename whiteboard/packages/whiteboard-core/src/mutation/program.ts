import type {
  MutationOrderedAnchor,
  MutationPorts,
  MutationProgramWriter
} from '@shared/mutation'
import {
  createMutationPorts
} from '@shared/mutation'
import type {
  CanvasItemRef,
  EdgeId,
  EdgeLabel,
  EdgeLabelAnchor,
  EdgeLabelPatch,
  EdgeRoutePoint,
  EdgeRoutePointAnchor
} from '@whiteboard/core/types'
import {
  canvasRefKey,
  toMutationOrderedAnchor,
  type WhiteboardMutationRegistry
} from './targets'
import {
  whiteboardMutationRegistry
} from './targets'

type WhiteboardBaseMutationPorts = MutationPorts<
  WhiteboardMutationRegistry,
  string
>

type CanvasOrderPort = ReturnType<WhiteboardBaseMutationPorts['canvasOrder']> & {
  moveRef(ref: CanvasItemRef, to: MutationOrderedAnchor): void
  spliceRefs(refs: readonly CanvasItemRef[], to: MutationOrderedAnchor): void
  deleteRef(ref: CanvasItemRef): void
}

type EdgeOrderedAnchor = MutationOrderedAnchor | EdgeLabelAnchor | EdgeRoutePointAnchor

export type WhiteboardMutationPorts = Omit<
  WhiteboardBaseMutationPorts,
  'canvasOrder' | 'edgeLabels' | 'edgeRoute'
> & {
  canvasOrder(key?: string): CanvasOrderPort
  edgeLabels(edgeId: EdgeId): Omit<
    ReturnType<WhiteboardBaseMutationPorts['edgeLabels']>,
    'insert' | 'move'
  > & {
    insert(
      value: EdgeLabel,
      to?: EdgeOrderedAnchor,
      tags?: readonly string[],
      metadata?: {
        delta?: import('@shared/mutation').MutationDeltaInput
        footprint?: readonly import('@shared/mutation').MutationFootprint[]
      }
    ): void
    move(
      itemId: string,
      to?: EdgeOrderedAnchor,
      tags?: readonly string[],
      metadata?: {
        delta?: import('@shared/mutation').MutationDeltaInput
        footprint?: readonly import('@shared/mutation').MutationFootprint[]
      }
    ): void
  }
  edgeRoute(edgeId: EdgeId): Omit<
    ReturnType<WhiteboardBaseMutationPorts['edgeRoute']>,
    'insert' | 'move'
  > & {
    insert(
      value: EdgeRoutePoint,
      to?: EdgeOrderedAnchor,
      tags?: readonly string[],
      metadata?: {
        delta?: import('@shared/mutation').MutationDeltaInput
        footprint?: readonly import('@shared/mutation').MutationFootprint[]
      }
    ): void
    move(
      itemId: string,
      to?: EdgeOrderedAnchor,
      tags?: readonly string[],
      metadata?: {
        delta?: import('@shared/mutation').MutationDeltaInput
        footprint?: readonly import('@shared/mutation').MutationFootprint[]
      }
    ): void
  }
}

const resolveOrderedAnchor = (
  anchor: EdgeOrderedAnchor | undefined
): MutationOrderedAnchor | undefined => {
  if (!anchor) {
    return undefined
  }

  return (
    (anchor.kind === 'before' || anchor.kind === 'after')
    && !('itemId' in anchor)
  )
    ? toMutationOrderedAnchor(anchor)
    : anchor
}

export const createWhiteboardMutationPorts = (
  writer: MutationProgramWriter<string>
): WhiteboardMutationPorts => {
  const ports = createMutationPorts(
    whiteboardMutationRegistry,
    writer
  )

  return {
    ...ports,
    canvasOrder: (key) => {
      const ordered = ports.canvasOrder(key)
      return {
        ...ordered,
        moveRef: (ref, to) => ordered.move(canvasRefKey(ref), to),
        spliceRefs: (refs, to) => ordered.splice(refs.map((ref) => canvasRefKey(ref)), to),
        deleteRef: (ref) => ordered.delete(canvasRefKey(ref))
      }
    },
    edgeLabels: (edgeId) => {
      const ordered = ports.edgeLabels(edgeId)
      return {
        ...ordered,
        insert: (value, to, tags, metadata) => ordered.insert(
          value,
          resolveOrderedAnchor(to),
          tags,
          metadata
        ),
        move: (itemId, to, tags, metadata) => ordered.move(
          itemId,
          resolveOrderedAnchor(to),
          tags,
          metadata
        )
      }
    },
    edgeRoute: (edgeId) => {
      const ordered = ports.edgeRoute(edgeId)
      return {
        ...ordered,
        insert: (value, to, tags, metadata) => ordered.insert(
          value,
          resolveOrderedAnchor(to),
          tags,
          metadata
        ),
        move: (itemId, to, tags, metadata) => ordered.move(
          itemId,
          resolveOrderedAnchor(to),
          tags,
          metadata
        )
      }
    }
  }
}
