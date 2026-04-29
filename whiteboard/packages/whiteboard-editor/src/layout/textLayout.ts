import {
  type Path
} from '@shared/draft'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type { TransformPreviewPatch } from '@whiteboard/core/node'
import type {
  MindmapTemplate,
  MindmapTemplateNode,
  Node,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  Rect,
  Size,
  Origin
} from '@whiteboard/core/types'
import type {
  TextMeasureResult,
  TextMeasureTarget
} from '@whiteboard/editor-scene'
import type { TextPreviewPatch } from '@whiteboard/editor/session/preview/types'
import type {
  LayoutBackend,
  LayoutKind,
  LayoutRequest,
  TextMetricsResource
} from '@whiteboard/editor/types/layout'
import type { NodeSpecReader } from '@whiteboard/editor/types/node'
import { createTextMetricsResource } from '@whiteboard/editor/layout/textMetrics'

const TEXT_PLACEHOLDER = 'Text'
const EDGE_LABEL_PLACEHOLDER = 'Label'
const EDGE_LABEL_MAX_WIDTH = 4096
const EMPTY_TEXT_FRAME_INSETS = {
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  borderTop: 0,
  borderRight: 0,
  borderBottom: 0,
  borderLeft: 0
} as const

const SIZE_LAYOUT_STYLE_PATHS: readonly Path[] = [
  'fontSize',
  'fontWeight',
  'fontStyle'
]

const SIZE_LAYOUT_DATA_PATHS: readonly Path[] = [
  'text',
  'widthMode',
  'wrapWidth'
]

const FIT_LAYOUT_STYLE_PATHS: readonly Path[] = [
  'fontWeight',
  'fontStyle'
]

const FIT_LAYOUT_DATA_PATHS: readonly Path[] = [
  'text',
  'fontMode'
]

const FONT_MODE_PATH = 'fontMode'
const FONT_SIZE_PATH = 'fontSize'

const hasTrackedPath = (
  paths: readonly Path[],
  value?: Path
) => {
  const target = value ?? ''
  return paths.some((path) => path === target)
}

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(value, key)

const readLayoutKind = (
  nodes: NodeSpecReader,
  node: Pick<Node, 'type'>
): LayoutKind => nodes.get(node.type)?.behavior.layout?.kind ?? 'none'

const readFontSize = (
  node: Pick<Node, 'style'>
) => typeof node.style?.fontSize === 'number'
  ? node.style.fontSize
  : nodeApi.text.defaultFontSize

const readFontWeight = (
  node: Pick<Node, 'style'>
) => (
  typeof node.style?.fontWeight === 'number'
  || typeof node.style?.fontWeight === 'string'
)
  ? node.style.fontWeight
  : undefined

const readFontStyle = (
  node: Pick<Node, 'style'>
) => typeof node.style?.fontStyle === 'string'
  ? node.style.fontStyle
  : undefined

const patchRect = (
  rect: Rect,
  fields?: Pick<NodeUpdateInput, 'fields'>['fields'] | {
    position?: TextPreviewPatch['position']
    size?: TextPreviewPatch['size']
  }
): Rect => ({
  x: fields?.position?.x ?? rect.x,
  y: fields?.position?.y ?? rect.y,
  width: fields?.size?.width ?? rect.width,
  height: fields?.size?.height ?? rect.height
})

const applyPreviewNode = (
  node: Node,
  preview: TextPreviewPatch
): Node => {
  const style = preview.fontSize === undefined
    ? node.style
    : {
        ...(node.style ?? {}),
        fontSize: preview.fontSize
      }

  if (node.type !== 'text') {
    return style === node.style
      ? node
      : {
          ...node,
          style
        }
  }

  const nextData = {
    ...(node.data ?? {})
  }
  const nextWidthMode = preview.mode ?? nodeApi.text.widthMode(node)
  nextData.widthMode = nextWidthMode
  if (nextWidthMode === 'wrap') {
    nextData.wrapWidth = preview.wrapWidth ?? nodeApi.text.wrapWidth(node)
  } else {
    delete nextData.wrapWidth
  }
  const data = (
    nextData.widthMode === node.data?.widthMode
    && nextData.wrapWidth === node.data?.wrapWidth
  )
    ? node.data
    : nextData

  return (
    style === node.style
    && data === node.data
  )
    ? node
    : {
        ...node,
        style,
        data
      }
}

const buildLayoutRequest = ({
  nodeId,
  node,
  rect,
  kind
}: {
  nodeId: NodeId
  node: Node
  rect: Rect
  kind: LayoutKind
}): LayoutRequest | undefined => {
  if (kind === 'size' && node.type === 'text') {
    const input = nodeApi.text.layoutInput(node, {
      width: rect.width,
      height: rect.height
    })
    if (!input) {
      return undefined
    }

    return {
      kind: 'size',
      nodeId,
      source: {
        kind: 'node',
        nodeId,
        field: 'text'
      },
      typography: 'default-text',
      text: input.text,
      placeholder: TEXT_PLACEHOLDER,
      widthMode: input.widthMode,
      wrapWidth: input.wrapWidth,
      frame: input.frame,
      minWidth: input.minWidth,
      maxWidth: input.maxWidth,
      fontSize: input.fontSize,
      fontWeight: input.fontWeight,
      fontStyle: input.fontStyle
    }
  }

  if (
    kind === 'fit'
    && node.type === 'sticky'
    && nodeApi.text.stickyFontMode(node) === 'auto'
  ) {
    return {
      kind: 'fit',
      nodeId,
      source: {
        kind: 'node',
        nodeId,
        field: 'text'
      },
      typography: 'sticky-text',
      text: typeof node.data?.text === 'string'
        ? node.data.text
        : '',
      box: nodeApi.text.box('sticky', rect),
      fontWeight: readFontWeight(node),
      fontStyle: readFontStyle(node),
      textAlign: 'center'
    }
  }

  return undefined
}

const isLayoutAffectingUpdate = (
  kind: LayoutKind,
  update: NodeUpdateInput
) => {
  if (kind === 'size' && update.fields && hasOwn(update.fields, 'size')) {
    return false
  }

  if (kind === 'fit' && update.fields?.size) {
    return true
  }

  return Object.keys(update.record ?? {}).some((path) => (
    path.startsWith('style.')
      ? (
          kind === 'size'
            ? hasTrackedPath(SIZE_LAYOUT_STYLE_PATHS, path.slice('style.'.length))
            : hasTrackedPath(FIT_LAYOUT_STYLE_PATHS, path.slice('style.'.length))
        )
      : path.startsWith('data.')
        ? (
            kind === 'size'
              ? hasTrackedPath(SIZE_LAYOUT_DATA_PATHS, path.slice('data.'.length))
              : hasTrackedPath(FIT_LAYOUT_DATA_PATHS, path.slice('data.'.length))
          )
        : false
  ))
}

const normalizeStickyFontModeUpdate = ({
  node,
  update,
  origin
}: {
  node: Node
  update: NodeUpdateInput
  origin?: Origin
}) => {
  if (node.type !== 'sticky' || origin === 'system') {
    return update
  }

  const recordKeys = Object.keys(update.record ?? {})
  const touchesFontMode = recordKeys.includes(`data.${FONT_MODE_PATH}`)
  const touchesFontSize = recordKeys.includes(`style.${FONT_SIZE_PATH}`)

  if (!touchesFontSize || touchesFontMode) {
    return update
  }

  return nodeApi.update.merge(
    update,
    {
      record: {
        'data.fontMode': 'fixed'
      }
    }
  )
}

const toLayoutResultUpdate = ({
  kind,
  committed,
  request,
  result
}: {
  kind: LayoutKind
  committed: {
    node: Node
    rect: Rect
  }
  request: LayoutRequest
  result: TextMeasureResult | undefined
}) => {
  if (kind === 'size' && request.kind === 'size' && result?.kind === 'size') {
    return nodeApi.text.shouldPatchLayout(committed.node, result.size)
      ? {
          fields: {
            size: result.size
          }
        }
      : undefined
  }

  if (kind === 'fit' && request.kind === 'fit' && result?.kind === 'fit') {
    const currentFontSize = typeof committed.node.style?.fontSize === 'number'
      ? committed.node.style.fontSize
      : undefined

    return currentFontSize === result.fontSize
      ? undefined
      : {
          record: {
            'style.fontSize': result.fontSize
          }
        }
  }

  return undefined
}

const measureEdgeLabelFallback = ({
  target,
  text
}: {
  target: Extract<TextMeasureTarget, { kind: 'edge-label' }>
  text: TextMetricsResource
}): Size => {
  const value = typeof target.label.text === 'string'
    ? target.label.text
    : ''
  const placeholder = EDGE_LABEL_PLACEHOLDER
  const fontSize = target.label.style?.size ?? edgeApi.label.defaultSize
  const fontWeight = target.label.style?.weight
  const fontStyle = target.label.style?.italic
    ? 'italic'
    : undefined
  const lines = value.split('\n')
  const measureLines = lines.length > 0
    ? lines
    : ['']
  const width = measureLines.reduce((current, line) => Math.max(
    current,
    text.measure({
      profile: 'edge-label',
      text: line,
      placeholder: lines.length === 1 && line === ''
        ? placeholder
        : ' ',
      fontSize,
      fontWeight,
      fontStyle
    }).width
  ), 1)

  return {
    width,
    height: Math.max(
      1,
      Math.ceil(Math.max(1, lines.length) * fontSize * edgeApi.label.lineHeight)
    )
  }
}

export type TextLayoutMeasure = (
  request: TextMeasureTarget
) => TextMeasureResult | undefined

export interface EditorTextLayout {
  text: TextMetricsResource
  measure: TextLayoutMeasure
}

export const createEditorTextLayout = ({
  nodes,
  backend
}: {
  nodes: NodeSpecReader
  backend?: LayoutBackend
}): EditorTextLayout => {
  const text = createTextMetricsResource()

  return {
    text,
    measure: (request) => {
      if (request.kind === 'node') {
        const kind = readLayoutKind(nodes, request.node)
        const layoutRequest = buildLayoutRequest({
          nodeId: request.nodeId,
          node: request.node,
          rect: request.rect,
          kind
        })
        return layoutRequest
          ? backend?.measure(layoutRequest)
          : undefined
      }

      const layoutRequest: LayoutRequest = {
        kind: 'size',
        source: {
          kind: 'edge-label',
          edgeId: request.edgeId,
          labelId: request.labelId
        },
        typography: 'edge-label',
        text: typeof request.label.text === 'string'
          ? request.label.text
          : '',
        placeholder: EDGE_LABEL_PLACEHOLDER,
        widthMode: 'auto',
        frame: EMPTY_TEXT_FRAME_INSETS,
        minWidth: 1,
        maxWidth: EDGE_LABEL_MAX_WIDTH,
        fontSize: request.label.style?.size ?? edgeApi.label.defaultSize,
        fontWeight: request.label.style?.weight,
        fontStyle: request.label.style?.italic
          ? 'italic'
          : undefined
      }
      const result = backend?.measure(layoutRequest)

      return result?.kind === 'size'
        ? result
        : {
            kind: 'size',
            size: measureEdgeLabelFallback({
              target: request,
              text
            })
          }
    }
  }
}

export const patchNodeCreateByTextMeasure = (input: {
  payload: NodeInput
  nodes: NodeSpecReader
  measure: TextLayoutMeasure
}): NodeInput => {
  if (!input.payload.type) {
    return input.payload
  }

  const kind = readLayoutKind(input.nodes, input.payload)
  if (kind === 'none') {
    return input.payload
  }

  const bootstrapSize = nodeApi.bootstrap.resolve(input.payload) ?? {
    width: 1,
    height: 1
  }
  const position = input.payload.position ?? {
    x: 0,
    y: 0
  }
  const node = {
    id: input.payload.id ?? '__layout_create__',
    type: input.payload.type,
    position,
    size: input.payload.size ?? bootstrapSize,
    rotation: input.payload.rotation,
    locked: input.payload.locked,
    data: input.payload.data,
    style: input.payload.style
  } satisfies Node
  const result = input.measure({
    kind: 'node',
    nodeId: node.id,
    node,
    rect: {
      x: position.x,
      y: position.y,
      width: node.size?.width ?? bootstrapSize.width,
      height: node.size?.height ?? bootstrapSize.height
    }
  })

  if (result?.kind === 'size') {
    return geometryApi.equal.size(input.payload.size, result.size)
      ? input.payload
      : {
          ...input.payload,
          size: result.size
        }
  }

  if (result?.kind === 'fit') {
    const currentFontSize = typeof input.payload.style?.fontSize === 'number'
      ? input.payload.style.fontSize
      : undefined
    if (currentFontSize === result.fontSize) {
      return input.payload
    }

    return {
      ...input.payload,
      style: {
        ...(input.payload.style ?? {}),
        fontSize: result.fontSize
      }
    }
  }

  return input.payload
}

export const patchMindmapTemplateByTextMeasure = (input: {
  template: MindmapTemplate
  position?: {
    x: number
    y: number
  }
  nodes: NodeSpecReader
  measure: TextLayoutMeasure
}): MindmapTemplate => {
  const patchNode = (
    templateNode: MindmapTemplateNode,
    position: {
      x: number
      y: number
    }
  ): MindmapTemplateNode => ({
    ...templateNode,
    node: patchNodeCreateByTextMeasure({
      payload: {
        ...templateNode.node,
        position
      },
      nodes: input.nodes,
      measure: input.measure
    }),
    children: templateNode.children?.map((child) => patchNode(child, {
      x: 0,
      y: 0
    }))
  })

  return {
    ...input.template,
    root: patchNode(input.template.root, input.position ?? { x: 0, y: 0 })
  }
}

export const patchNodeUpdateByTextMeasure = (input: {
  nodeId: NodeId
  node: Node
  rect: Rect
  update: NodeUpdateInput
  nodes: NodeSpecReader
  measure: TextLayoutMeasure
  origin?: Origin
}): NodeUpdateInput => {
  const kind = readLayoutKind(input.nodes, input.node)
  const normalized = normalizeStickyFontModeUpdate({
    node: input.node,
    update: input.update,
    origin: input.origin
  })
  if (kind === 'none' || !isLayoutAffectingUpdate(kind, normalized)) {
    return normalized
  }

  const applied = nodeApi.update.apply(input.node, normalized)
  if (!applied.ok) {
    return normalized
  }

  const nextRect = patchRect(input.rect, normalized.fields)
  const request = buildLayoutRequest({
    nodeId: input.nodeId,
    node: applied.next,
    rect: nextRect,
    kind
  })
  if (!request) {
    return normalized
  }

  return nodeApi.update.merge(
    normalized,
    toLayoutResultUpdate({
      kind,
      committed: {
        node: input.node,
        rect: input.rect
      },
      request,
      result: input.measure({
        kind: 'node',
        nodeId: input.nodeId,
        node: applied.next,
        rect: nextRect
      })
    })
  )
}

export const patchNodePreviewByTextMeasure = (input: {
  patches: readonly TransformPreviewPatch[]
  readNode(nodeId: NodeId): Node | undefined
  readRect(nodeId: NodeId): Rect | undefined
  nodes: NodeSpecReader
  measure: TextLayoutMeasure
}): readonly TransformPreviewPatch[] => input.patches.map((patch) => {
  const node = input.readNode(patch.id)
  const rect = input.readRect(patch.id)
  if (!node || !rect) {
    return patch
  }

  const kind = readLayoutKind(input.nodes, node)
  if (kind === 'size') {
    if (
      node.type !== 'text'
      || patch.handle === undefined
      || nodeApi.text.handle(patch.handle) !== 'reflow'
    ) {
      return patch
    }

    const nextNode = applyPreviewNode(node, patch)
    const nextRect = patchRect(rect, patch)
    const result = input.measure({
      kind: 'node',
      nodeId: patch.id,
      node: nextNode,
      rect: nextRect
    })
    if (result?.kind !== 'size') {
      return patch
    }

    const projected = nodeApi.transform.anchoredRect({
      rect: nextRect,
      handle: patch.handle,
      width: result.size.width,
      height: result.size.height
    })

    return {
      ...patch,
      position: {
        x: projected.x,
        y: projected.y
      },
      size: {
        width: projected.width,
        height: projected.height
      }
    }
  }

  if (
    kind !== 'fit'
    || node.type !== 'sticky'
    || nodeApi.text.stickyFontMode(node) === 'fixed'
    || !patch.size
    || geometryApi.equal.size(patch.size, rect)
  ) {
    return patch
  }

  const result = input.measure({
    kind: 'node',
    nodeId: patch.id,
    node,
    rect: patchRect(rect, patch)
  })

  return result?.kind === 'fit'
    ? {
        ...patch,
        fontSize: result.fontSize
      }
    : patch
})
