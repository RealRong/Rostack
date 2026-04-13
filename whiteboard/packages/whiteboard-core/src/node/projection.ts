import { isPointEqual, isSizeEqual } from '../geometry'
import type { Node, NodeFieldPatch, Point, Rect, Size } from '../types'
import type { TextWidthMode } from './text'
import {
  readTextWrapWidth,
  readTextWidthMode,
  setTextWrapWidth,
  setTextWidthMode
} from './text'

type NodeProjectionItem<TNode extends Node = Node> = {
  node: TNode
  rect: Rect
}

type NodeTextPreviewPatch = {
  position?: Point
  size?: Size
  fontSize?: number
  mode?: TextWidthMode
  wrapWidth?: number
}

type NodeTextDraft = {
  field: string
  value: string
  liveSize?: Size
}

const patchNodeRect = (
  rect: Rect,
  patch?: Pick<NodeFieldPatch, 'position' | 'size'>
) => {
  if (!patch?.position && !patch?.size) {
    return rect
  }

  const next = {
    x: patch.position?.x ?? rect.x,
    y: patch.position?.y ?? rect.y,
    width: patch.size?.width ?? rect.width,
    height: patch.size?.height ?? rect.height
  }

  return (
    next.x === rect.x
    && next.y === rect.y
    && next.width === rect.width
    && next.height === rect.height
  )
    ? rect
    : next
}

export const applyNodeGeometryPatch = <
  TNode extends Node,
  TItem extends NodeProjectionItem<TNode>
>(
  item: TItem,
  patch?: Pick<NodeFieldPatch, 'position' | 'size' | 'rotation'>
): TItem => {
  if (!patch) {
    return item
  }

  const nextNode = (
    !patch.position
    && !patch.size
    && patch.rotation === undefined
  )
    ? item.node
    : {
        ...item.node,
        position: patch.position ?? item.node.position,
        size: patch.size ?? item.node.size,
        rotation:
          typeof patch.rotation === 'number'
            ? patch.rotation
            : item.node.rotation
      }
  const nextRect = patchNodeRect(item.rect, patch)

  return nextNode === item.node && nextRect === item.rect
    ? item
    : {
        ...item,
        node: nextNode,
        rect: nextRect
      }
}

export const applyNodeTextPreview = <
  TNode extends Node,
  TItem extends NodeProjectionItem<TNode>
>(
  item: TItem,
  preview?: NodeTextPreviewPatch
): TItem => {
  if (!preview || item.node.type !== 'text') {
    return item
  }

  const currentFontSize = typeof item.node.style?.fontSize === 'number'
    ? item.node.style.fontSize
    : undefined
  const style = preview.fontSize === undefined || preview.fontSize === currentFontSize
    ? item.node.style
    : {
        ...(item.node.style ?? {}),
        fontSize: preview.fontSize
      }
  const data = preview.mode === undefined || preview.mode === readTextWidthMode(item.node)
    ? item.node.data
    : setTextWidthMode(item.node, preview.mode)
  const nextWrapWidth = preview.mode === 'auto'
    ? undefined
    : preview.wrapWidth
  const dataWithWrapWidth = nextWrapWidth === readTextWrapWidth(item.node)
    ? data
    : setTextWrapWidth({ data }, nextWrapWidth)
  const nextRect = patchNodeRect(item.rect, preview)

  return (
    style === item.node.style
    && dataWithWrapWidth === item.node.data
    && nextRect === item.rect
  )
    ? item
    : {
        ...item,
        node: {
          ...item.node,
          style,
          data: dataWithWrapWidth
        },
        rect: nextRect
      }
}

export const applyNodeTextDraft = <
  TNode extends Node,
  TItem extends NodeProjectionItem<TNode>
>(
  item: TItem,
  draft?: NodeTextDraft
): TItem => {
  if (!draft) {
    return item
  }

  const nextData = {
    ...(item.node.data ?? {}),
    [draft.field]: draft.value
  }
  const nextRect = draft.liveSize && !isSizeEqual(draft.liveSize, item.rect)
    ? {
        ...item.rect,
        width: draft.liveSize.width,
        height: draft.liveSize.height
      }
    : item.rect

  return nextRect === item.rect && draft.value === item.node.data?.[draft.field]
    ? item
    : {
        ...item,
        node: {
          ...item.node,
          data: nextData
        },
        rect: nextRect
      }
}

export const isNodeProjectionPatchEqual = (
  left: Pick<NodeFieldPatch, 'position' | 'size' | 'rotation'> | undefined,
  right: Pick<NodeFieldPatch, 'position' | 'size' | 'rotation'> | undefined
) => (
  isPointEqual(left?.position, right?.position)
  && isSizeEqual(left?.size, right?.size)
  && left?.rotation === right?.rotation
)
