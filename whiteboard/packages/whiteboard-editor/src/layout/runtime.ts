import { isSizeEqual } from '@whiteboard/core/geometry'
import { EDGE_LABEL_LINE_HEIGHT } from '@whiteboard/core/edge'
import {
  applyNodeUpdate,
  readTextLayoutInput,
  readStickyFontMode,
  TEXT_LAYOUT_MIN_WIDTH,
  readTextWrapWidth,
  readTextWidthMode,
  resolveAnchoredRect,
  resolveTextBox,
  resolveTextHandle,
  resolveNodeBootstrapSize,
  shouldPatchTextLayout,
  TEXT_DEFAULT_FONT_SIZE
} from '@whiteboard/core/node'
import type { TransformPreviewPatch } from '@whiteboard/core/node'
import {
  compileNodeDataUpdate,
  compileNodeStyleUpdate,
  mergeNodeUpdates
} from '@whiteboard/core/schema'
import type {
  Node,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  Rect,
  Size,
  Origin
} from '@whiteboard/core/types'
import type { TextPreviewPatch } from '@whiteboard/editor/session/preview/types'
import type { EditField, EditLayout, EditSession } from '@whiteboard/editor/session/edit'
import type { MindmapPreviewState } from '@whiteboard/editor/session/preview/types'
import type { ReadStore } from '@shared/core'
import type {
  LayoutBackend,
  LayoutKind,
  LayoutRequest,
  TextMetricsCache,
  TextMetrics,
  TextMetricsSpec,
  TextTypographyProfile
} from '@whiteboard/editor/types/layout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import {
  createMindmapLayoutRead,
  type MindmapLayoutRead
} from '@whiteboard/editor/layout/mindmap'
import type { EngineRead, MindmapItem } from '@whiteboard/engine'

const TEXT_PLACEHOLDER = 'Text'
const TEXT_DEFAULT_LINE_HEIGHT_RATIO = 1.4
const TEXT_MEASURE_EMPTY_CONTENT = ' '
const TEXT_METRICS_FALLBACK_FONT_FAMILY = 'sans-serif'

const SIZE_LAYOUT_STYLE_PATHS = new Set([
  'fontSize',
  'fontWeight',
  'fontStyle'
])

const SIZE_LAYOUT_DATA_PATHS = new Set([
  'text',
  'widthMode',
  'wrapWidth'
])

const FIT_LAYOUT_STYLE_PATHS = new Set([
  'fontWeight',
  'fontStyle'
])

const FIT_LAYOUT_DATA_PATHS = new Set([
  'text',
  'fontMode'
])

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(value, key)

const readLayoutKind = (
  registry: Pick<NodeRegistry, 'get'>,
  node: Pick<Node, 'type'>
): LayoutKind => registry.get(node.type)?.layout?.kind ?? 'none'

const readFontSize = (
  node: Pick<Node, 'style'>
) => typeof node.style?.fontSize === 'number'
  ? node.style.fontSize
  : TEXT_DEFAULT_FONT_SIZE

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
  const nextWidthMode = preview.mode ?? readTextWidthMode(node)
  nextData.widthMode = nextWidthMode
  if (nextWidthMode === 'wrap') {
    nextData.wrapWidth = preview.wrapWidth ?? readTextWrapWidth(node)
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
    const input = readTextLayoutInput(node, {
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
    && readStickyFontMode(node) === 'auto'
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
      box: resolveTextBox('sticky', rect),
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

  return (update.records ?? []).some((record) => (
    record.scope === 'style'
      ? (
          kind === 'size'
            ? SIZE_LAYOUT_STYLE_PATHS.has(record.path ?? '')
            : FIT_LAYOUT_STYLE_PATHS.has(record.path ?? '')
        )
      : (
          kind === 'size'
            ? SIZE_LAYOUT_DATA_PATHS.has(record.path ?? '')
            : FIT_LAYOUT_DATA_PATHS.has(record.path ?? '')
        )
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

  const touchesFontMode = (update.records ?? []).some(
    (record) => record.scope === 'data' && record.path === 'fontMode'
  )
  const touchesFontSize = (update.records ?? []).some(
    (record) => record.scope === 'style' && record.path === 'fontSize'
  )

  if (!touchesFontSize || touchesFontMode) {
    return update
  }

  return mergeNodeUpdates(
    update,
    compileNodeDataUpdate('fontMode', 'fixed')
  )
}

const toLayoutResultUpdate = ({
  kind,
  committed,
  request,
  fontSize,
  size
}: {
  kind: LayoutKind
  committed: {
    node: Node
    rect: Rect
  }
  request: LayoutRequest
  fontSize?: number
  size?: Size
}) => {
  if (kind === 'size' && request.kind === 'size' && size) {
    return shouldPatchTextLayout(committed.node, size)
      ? {
          fields: {
            size
          }
        }
      : undefined
  }

  if (kind === 'fit' && request.kind === 'fit' && fontSize !== undefined) {
    const currentFontSize = typeof committed.node.style?.fontSize === 'number'
      ? committed.node.style.fontSize
      : undefined

    return currentFontSize === fontSize
      ? undefined
      : compileNodeStyleUpdate('fontSize', fontSize)
  }

  return undefined
}

const readTextMetricsKey = (
  spec: TextMetricsSpec
) => [
  spec.profile,
  spec.text,
  spec.placeholder,
  spec.fontSize,
  spec.fontWeight ?? '',
  spec.fontStyle ?? ''
].join('\u0001')

const normalizeTextMetricsSpec = (
  spec: TextMetricsSpec
): TextMetricsSpec => ({
  ...spec,
  text: spec.text ?? '',
  placeholder: spec.placeholder || TEXT_MEASURE_EMPTY_CONTENT,
  fontSize: Math.max(1, Math.ceil(spec.fontSize))
})

const readTextMetricsContent = (
  spec: TextMetricsSpec
) => spec.text || spec.placeholder || TEXT_MEASURE_EMPTY_CONTENT

const readTextMetricsLineHeight = (
  profile: TextTypographyProfile
) => profile === 'edge-label'
  ? EDGE_LABEL_LINE_HEIGHT
  : TEXT_DEFAULT_LINE_HEIGHT_RATIO

const createMeasureCanvasContext = () => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const context = new OffscreenCanvas(1, 1).getContext('2d')
    if (context) {
      return context
    }
  }

  if (typeof document !== 'undefined') {
    const context = document.createElement('canvas').getContext('2d')
    if (context) {
      return context
    }
  }

  return undefined
}

const readMeasureFontFamily = () => {
  if (
    typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && document.body
  ) {
    const value = window.getComputedStyle(document.body).fontFamily
    if (value) {
      return value
    }
  }

  return TEXT_METRICS_FALLBACK_FONT_FAMILY
}

const measureCanvasText = ({
  spec,
  context,
  fontFamily
}: {
  spec: TextMetricsSpec
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | undefined
  fontFamily: string
}): TextMetrics | undefined => {
  if (!context) {
    return undefined
  }

  context.font = [
    spec.fontStyle ?? 'normal',
    'normal',
    `${spec.fontWeight ?? 400}`,
    `${spec.fontSize}px`,
    fontFamily
  ].join(' ')

  return {
    width: Math.max(
      1,
      Math.ceil(context.measureText(
        readTextMetricsContent(spec)
      ).width)
    ),
    height: Math.max(
      1,
      Math.ceil(spec.fontSize * readTextMetricsLineHeight(spec.profile))
    )
  }
}

const fallbackMeasureText = (
  spec: TextMetricsSpec
): TextMetrics => ({
    width: Math.max(
      1,
      Math.ceil(readTextMetricsContent(spec).length * spec.fontSize * 0.6)
    ),
    height: Math.max(
      1,
      Math.ceil(spec.fontSize * readTextMetricsLineHeight(spec.profile))
    )
  })

export type EditorLayout = {
  text: TextMetricsCache
  mindmap: MindmapLayoutRead
  patchNodeCreatePayload: (
    payload: NodeInput
  ) => NodeInput
  patchNodeUpdate: (
    nodeId: NodeId,
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => NodeUpdateInput
  editNode: (
    input: {
      nodeId: NodeId
      field: EditField
      text: string
    }
  ) => Partial<EditLayout> | undefined
  resolvePreviewPatches: (
    patches: readonly TransformPreviewPatch[]
  ) => readonly TransformPreviewPatch[]
}

export const createEditorLayout = ({
  read,
  session,
  registry,
  backend
}: {
  read: {
    node: {
      committed: EngineRead['node']['item']
    }
    mindmap: {
      committed: EngineRead['mindmap']['item']
    }
  }
  session: {
    edit: ReadStore<EditSession>
    mindmapPreview: ReadStore<MindmapPreviewState | undefined>
  }
  registry: Pick<NodeRegistry, 'get'>
  backend?: LayoutBackend
}): EditorLayout => {
  const textMetricsCache = new Map<string, TextMetrics>()
  const measureTextContext = createMeasureCanvasContext()
  const measureFontFamily = readMeasureFontFamily()

  const text: TextMetricsCache = {
    read: (spec) => textMetricsCache.get(
      readTextMetricsKey(
        normalizeTextMetricsSpec(spec)
      )
    ),
    ensure: (spec) => {
      const normalized = normalizeTextMetricsSpec(spec)
      const key = readTextMetricsKey(normalized)
      const cached = textMetricsCache.get(key)
      if (cached) {
        return cached
      }

      const measured = measureCanvasText({
        spec: normalized,
        context: measureTextContext,
        fontFamily: measureFontFamily
      }) ?? fallbackMeasureText(normalized)

      textMetricsCache.set(key, measured)
      return measured
    },
    ensureMany: (specs) => {
      const deduped = new Map<string, TextMetricsSpec>()
      for (let index = 0; index < specs.length; index += 1) {
        const normalized = normalizeTextMetricsSpec(specs[index]!)
        const key = readTextMetricsKey(normalized)
        if (!textMetricsCache.has(key) && !deduped.has(key)) {
          deduped.set(key, normalized)
        }
      }

      deduped.forEach((spec) => {
        text.ensure(spec)
      })
    },
    clear: () => {
      textMetricsCache.clear()
    }
  }
  const mindmap = createMindmapLayoutRead({
    committed: read.mindmap.committed,
    nodeCommitted: read.node.committed,
    edit: session.edit,
    preview: session.mindmapPreview
  })

  const resolveNodeRequest = ({
    nodeId,
    node,
    rect
  }: {
    nodeId: NodeId
    node: Node
    rect: Rect
  }) => buildLayoutRequest({
    nodeId,
    node,
    rect,
    kind: readLayoutKind(registry, node)
  })

  const patchCreatePayload = (
    payload: NodeInput
  ): NodeInput => {
    if (!backend || !payload.type) {
      return payload
    }

    const kind = readLayoutKind(registry, payload)
    if (kind === 'none') {
      return payload
    }

    const bootstrapSize = resolveNodeBootstrapSize(payload) ?? {
      width: 1,
      height: 1
    }
    const position = payload.position ?? {
      x: 0,
      y: 0
    }
    const node = {
      id: payload.id ?? '__layout_create__',
      type: payload.type,
      position,
      size: payload.size ?? bootstrapSize,
      rotation: payload.rotation,
      layer: payload.layer,
      zIndex: payload.zIndex,
      locked: payload.locked,
      data: payload.data,
      style: payload.style
    } satisfies Node
    const request = buildLayoutRequest({
      nodeId: node.id,
      node,
      rect: {
        x: position.x,
        y: position.y,
        width: node.size?.width ?? bootstrapSize.width,
        height: node.size?.height ?? bootstrapSize.height
      },
      kind
    })
    if (!request) {
      return payload
    }

    const result = backend.measure(request)
    if (!result) {
      return payload
    }

    if (request.kind === 'size' && result.kind === 'size') {
      return isSizeEqual(payload.size, result.size)
        ? payload
        : {
            ...payload,
            size: result.size
          }
    }

    if (request.kind === 'fit' && result.kind === 'fit') {
      const currentFontSize = typeof payload.style?.fontSize === 'number'
        ? payload.style.fontSize
        : undefined
      if (currentFontSize === result.fontSize) {
        return payload
      }

      return {
        ...payload,
        style: {
          ...(payload.style ?? {}),
          fontSize: result.fontSize
        }
      }
    }

    return payload
  }

  return {
    text,
    mindmap,
    patchNodeCreatePayload: patchCreatePayload,
    patchNodeUpdate: (nodeId, update, options) => {
      const committed = read.node.committed.get(nodeId)
      if (!committed) {
        return update
      }

      const kind = readLayoutKind(registry, committed.node)
      const normalized = normalizeStickyFontModeUpdate({
        node: committed.node,
        update,
        origin: options?.origin
      })
      if (!backend || kind === 'none' || !isLayoutAffectingUpdate(kind, normalized)) {
        return normalized
      }

      const applied = applyNodeUpdate(committed.node, normalized)
      if (!applied.ok) {
        return normalized
      }

      const request = resolveNodeRequest({
        nodeId,
        node: applied.next,
        rect: patchRect(committed.rect, normalized.fields)
      })
      if (!request) {
        return normalized
      }

      const result = backend.measure(request)
      if (!result) {
        return normalized
      }

      return mergeNodeUpdates(
        normalized,
        toLayoutResultUpdate({
          kind,
          committed,
          request,
          fontSize: result.kind === 'fit' ? result.fontSize : undefined,
          size: result.kind === 'size' ? result.size : undefined
        })
      )
    },

    editNode: ({
      nodeId,
      field,
      text
    }) => {
      const committed = read.node.committed.get(nodeId)
      if (!committed) {
        return undefined
      }

      const kind = readLayoutKind(registry, committed.node)
      if (kind === 'none' || field !== 'text') {
        return undefined
      }

      const nextNode: Node = {
        ...committed.node,
        data: {
          ...(committed.node.data ?? {}),
          [field]: text
        }
      }
      const request = resolveNodeRequest({
        nodeId,
        node: nextNode,
        rect: committed.rect
      })
      if (!request) {
        return undefined
      }

      const result = backend?.measure(request)
      if (request.kind === 'size') {
        return {
          size: result?.kind === 'size'
            ? result.size
            : {
                width: committed.rect.width,
                height: committed.rect.height
              },
          wrapWidth: request.wrapWidth
        }
      }

      return result?.kind === 'fit'
        ? {
            fontSize: result.fontSize
          }
        : undefined
    },

    resolvePreviewPatches: (patches) => patches.map((patch) => {
      const committed = read.node.committed.get(patch.id)
      if (!backend || !committed) {
        return patch
      }

      const kind = readLayoutKind(registry, committed.node)
      if (kind === 'size') {
        if (
          committed.node.type !== 'text'
          || patch.handle === undefined
          || resolveTextHandle(patch.handle) !== 'reflow'
        ) {
          return patch
        }

        const nextNode = applyPreviewNode(committed.node, patch)
        const nextRect = patchRect(committed.rect, patch)
        const request = resolveNodeRequest({
          nodeId: patch.id,
          node: nextNode,
          rect: nextRect
        })
        if (!request || request.kind !== 'size') {
          return patch
        }

        const result = backend.measure(request)
        if (!result || result.kind !== 'size') {
          return patch
        }

        const rect = resolveAnchoredRect({
          rect: nextRect,
          handle: patch.handle,
          width: result.size.width,
          height: result.size.height
        })

        return {
          ...patch,
          position: {
            x: rect.x,
            y: rect.y
          },
          size: {
            width: rect.width,
            height: rect.height
          }
        }
      }

      if (
        kind !== 'fit'
        || committed.node.type !== 'sticky'
        || readStickyFontMode(committed.node) === 'fixed'
        || !patch.size
        || isSizeEqual(patch.size, committed.rect)
      ) {
        return patch
      }

      const request = resolveNodeRequest({
        nodeId: patch.id,
        node: committed.node,
        rect: patchRect(committed.rect, patch)
      })
      if (!request || request.kind !== 'fit') {
        return patch
      }

      const result = backend.measure(request)
      return result?.kind === 'fit'
        ? {
            ...patch,
            fontSize: result.fontSize
          }
        : patch
    })
  }
}
