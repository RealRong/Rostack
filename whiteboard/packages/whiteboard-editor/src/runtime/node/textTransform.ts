import {
  computeResizeRect,
  getResizeSourceEdges,
  getResizeUpdateRect,
  readTextWrapWidth,
  readTextWidthMode,
  TEXT_DEFAULT_FONT_SIZE,
  toTransformCommitPatch,
  type ResizeGestureSnapshot,
  type TransformSelectionMember
} from '@whiteboard/core/node'
import type { Node, NodeUpdateInput, Rect } from '@whiteboard/core/types'
import type { ResizeSnapInput, ResizeSnapResult } from '../interaction/snap'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate
} from './patch'

type TextTransformMode = 'reflow' | 'scale'

type SnapResize = (input: ResizeSnapInput) => ResizeSnapResult

const readTextFontSize = (
  node: Node
) => (
  typeof node.style?.fontSize === 'number'
    ? node.style.fontSize
    : TEXT_DEFAULT_FONT_SIZE
)

export const readTextScaleMinSize = (
  rect: TransformSelectionMember<Node>['rect']
) => {
  const widthRatio = 20 / Math.max(rect.width, 0.0001)
  const heightRatio = 20 / Math.max(rect.height, 0.0001)
  const ratio = Math.max(widthRatio, heightRatio)

  return {
    width: rect.width * ratio,
    height: rect.height * ratio
  }
}

export const projectTextTransform = (input: {
  drag: ResizeGestureSnapshot
  mode: TextTransformMode
  target: TransformSelectionMember<Node>
  handle: ResizeGestureSnapshot['handle']
  screen: {
    x: number
    y: number
  }
  zoom: number
  minSize: {
    width: number
    height: number
  }
  snap: SnapResize
}) => {
  const startFontSize = readTextFontSize(input.target.node)
  const startWidthMode = readTextWidthMode(input.target.node)
  const rawRect = input.mode === 'reflow'
    ? computeResizeRect({
        drag: input.drag,
        currentScreen: input.screen,
        zoom: input.zoom,
        minSize: input.minSize,
        altKey: false,
        shiftKey: false
      }).rect
    : computeResizeRect({
        drag: input.drag,
        currentScreen: input.screen,
        zoom: input.zoom,
        minSize: readTextScaleMinSize(input.target.rect),
        altKey: false,
        shiftKey: true
      }).rect
  const { sourceX, sourceY } = getResizeSourceEdges(input.drag.handle)
  const snapped = input.snap({
    rect: rawRect,
    source: {
      x: sourceX,
      y: sourceY
    },
    minSize: input.minSize,
    excludeIds: [input.target.id],
    disabled: input.drag.startRotation !== 0
  })
  const nextRect = getResizeUpdateRect(snapped.update)
  const nextFontSize = input.mode === 'scale'
    ? Math.max(
        1,
        startFontSize * (
          nextRect.width / Math.max(input.target.rect.width, 0.0001)
        )
      )
    : undefined

  return {
    guides: snapped.guides,
    preview: {
      position: {
        x: nextRect.x,
        y: nextRect.y
      },
      size: {
        width: nextRect.width,
        height: nextRect.height
      },
      mode: input.mode === 'reflow'
        ? 'wrap'
        : startWidthMode,
      wrapWidth: input.mode === 'reflow' || startWidthMode === 'wrap'
        ? nextRect.width
        : undefined,
      handle: input.handle,
      ...(input.mode === 'scale' && nextFontSize !== undefined
        ? {
            fontSize: nextFontSize
          }
        : {})
    }
  }
}

export const commitTextTransform = (input: {
  target: TransformSelectionMember<Node>
  mode: TextTransformMode
  preview: {
    node: Node
    rect: Rect
  }
}): NodeUpdateInput | undefined => {
  const geometry = toTransformCommitPatch(input.target.node, {
    position: {
      x: input.preview.rect.x,
      y: input.preview.rect.y
    },
    size: {
      width: input.preview.rect.width,
      height: input.preview.rect.height
    }
  })
  const nextFontSize = input.preview.node.type === 'text'
    ? Math.max(1, Math.round(readTextFontSize(input.preview.node)))
    : undefined
  const update = mergeNodeUpdates(
    geometry
      ? {
          fields: geometry
        }
      : undefined,
    input.mode === 'reflow' && readTextWidthMode(input.target.node) !== 'wrap'
      ? dataUpdate('widthMode', 'wrap')
      : undefined,
    readTextWidthMode(input.preview.node) === 'wrap'
    && readTextWrapWidth(input.target.node) !== input.preview.rect.width
      ? dataUpdate('wrapWidth', input.preview.rect.width)
      : input.mode === 'scale'
        && readTextWidthMode(input.preview.node) === 'auto'
        && readTextWrapWidth(input.target.node) !== undefined
          ? dataUpdate('wrapWidth', undefined)
        : undefined,
    input.mode === 'scale' && nextFontSize !== readTextFontSize(input.target.node)
      ? styleUpdate('fontSize', nextFontSize)
      : undefined
  )

  return update.fields || update.records?.length
    ? update
    : undefined
}
