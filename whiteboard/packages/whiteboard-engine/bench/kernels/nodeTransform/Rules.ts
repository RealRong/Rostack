import type { Size } from '@engine-types/common/base'
import type { PointerInput } from '@engine-types/common/input'
import type { BoardConfig } from '@engine-types/instance/config'
import type { EngineRead } from '@engine-types/instance/read'
import type { Guide } from '@engine-types/node/snap'
import type {
  NodeTransformResizeConstraints,
  ResizeDirection,
  ResizeDragState,
  RotateDragState
} from '@engine-types/node/transform'
import type { NodeId, Point, Rect } from '@whiteboard/core/types'
import {
  computeNextRotation,
  computeResizeRect,
  computeResizeSnap,
  getResizeSourceEdges
} from '@whiteboard/core/node'
import { getRectCenter } from '@whiteboard/core/geometry'
import { DEFAULT_TUNING } from '../../../src/config'

const ZOOM_EPSILON = 0.0001

type RulesOptions = {
  config: BoardConfig
  read: Pick<EngineRead, 'index'>
  readZoom: () => number
}

const resolveInteractionZoom = (zoom: number) =>
  Math.max(zoom, ZOOM_EPSILON)

const resolveSnapThresholdWorld = (
  config: BoardConfig['node'],
  zoom: number
) =>
  Math.min(
    config.snapThresholdScreen / resolveInteractionZoom(zoom),
    config.snapMaxThresholdWorld
  )

const expandRectByThreshold = (
  rect: Rect,
  thresholdWorld: number
): Rect => ({
  x: rect.x - thresholdWorld,
  y: rect.y - thresholdWorld,
  width: rect.width + thresholdWorld * 2,
  height: rect.height + thresholdWorld * 2
})

export class Rules {
  private readonly config: RulesOptions['config']
  private readonly read: RulesOptions['read']
  private readonly readZoom: RulesOptions['readZoom']

  constructor(options: RulesOptions) {
    this.config = options.config
    this.read = options.read
    this.readZoom = options.readZoom
  }

  createResizeDrag = (options: {
    pointer: PointerInput
    handle: ResizeDirection
    rect: Rect
    rotation: number
  }): ResizeDragState => {
    const { pointer, handle, rect, rotation } = options
    return {
      mode: 'resize',
      pointerId: pointer.pointerId,
      handle,
      startScreen: {
        x: pointer.client.x,
        y: pointer.client.y
      },
      startCenter: getRectCenter(rect),
      startRotation: rotation,
      startSize: {
        width: rect.width,
        height: rect.height
      },
      startAspect: rect.width / Math.max(rect.height, ZOOM_EPSILON)
    }
  }

  createRotateDrag = (options: {
    pointer: PointerInput
    rect: Rect
    rotation: number
  }): RotateDragState => {
    const { pointer, rect, rotation } = options
    const center = getRectCenter(rect)
    const startAngle = Math.atan2(
      pointer.world.y - center.y,
      pointer.world.x - center.x
    )
    return {
      mode: 'rotate',
      pointerId: pointer.pointerId,
      startAngle,
      startRotation: rotation,
      currentRotation: rotation,
      center
    }
  }

  resolveResizeMove = (options: {
    nodeId: NodeId
    drag: ResizeDragState
    cursorScreen: Point
    constraints: NodeTransformResizeConstraints
    minSize: Size
  }): {
    update: {
      position: Point
      size: Size
    }
    guides: Guide[]
  } => {
    const { nodeId, drag, cursorScreen, constraints, minSize } = options
    const zoom = resolveInteractionZoom(this.readZoom())
    const resized = computeResizeRect({
      handle: drag.handle,
      startScreen: drag.startScreen,
      currentScreen: cursorScreen,
      startCenter: drag.startCenter,
      startRotation: drag.startRotation,
      startSize: drag.startSize,
      startAspect: drag.startAspect,
      minSize,
      zoom,
      altKey: constraints.fromCenter,
      shiftKey: constraints.keepAspect
    })

    let nextRect = resized.rect
    let nextSize = {
      width: resized.width,
      height: resized.height
    }
    let guides: Guide[] = []

    if (constraints.snapEnabled && drag.startRotation === 0) {
      const thresholdWorld = resolveSnapThresholdWorld(
        this.config.node,
        zoom
      )
      const movingRect: Rect = {
        x: nextRect.x,
        y: nextRect.y,
        width: nextSize.width,
        height: nextSize.height
      }
      const candidates = this.read.index.snap.inRect(
        expandRectByThreshold(movingRect, thresholdWorld)
      )
      const { sourceX, sourceY } = getResizeSourceEdges(drag.handle)
      const snapped = computeResizeSnap({
        movingRect,
        candidates,
        threshold: thresholdWorld,
        minSize,
        excludeId: nodeId,
        sourceEdges: {
          sourceX,
          sourceY
        }
      })
      nextRect = snapped.rect
      nextSize = {
        width: snapped.width,
        height: snapped.height
      }
      guides = snapped.guides
    }

    return {
      update: {
        position: {
          x: nextRect.x,
          y: nextRect.y
        },
        size: nextSize
      },
      guides
    }
  }

  resolveRotate = (options: {
    drag: RotateDragState
    currentPoint: Point
    snapToStep: boolean
  }) =>
    computeNextRotation({
      center: options.drag.center,
      currentPoint: options.currentPoint,
      startAngle: options.drag.startAngle,
      startRotation: options.drag.startRotation,
      shiftKey: options.snapToStep
    })

  resolveMinSize = (minSize?: Size): Size =>
    minSize ?? DEFAULT_TUNING.nodeTransform.minSize
}
