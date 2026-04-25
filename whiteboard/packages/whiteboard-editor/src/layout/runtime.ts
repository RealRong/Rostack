import {
  path as mutationPath,
  type Path
} from '@shared/mutation'
import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type { TransformPreviewPatch } from '@whiteboard/core/node'
import { schema as schemaApi } from '@whiteboard/core/schema'
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
import type { TextMeasureTarget } from '@whiteboard/editor-scene'
import type { TextPreviewPatch } from '@whiteboard/editor/session/preview/types'
import type { EditField, EditSession } from '@whiteboard/editor/session/edit'
import { store } from '@shared/core'
import type {
  DraftMeasure,
  LayoutBackend,
  LayoutKind,
  LayoutRequest,
  TextMetricsResource
} from '@whiteboard/editor/types/layout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import {
  createTextMetricsResource
} from '@whiteboard/editor/layout/textMetrics'
import type { EditorDocumentRuntimeSource } from '@whiteboard/editor/document/source'

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
  mutationPath.of('fontSize'),
  mutationPath.of('fontWeight'),
  mutationPath.of('fontStyle')
]

const SIZE_LAYOUT_DATA_PATHS: readonly Path[] = [
  mutationPath.of('text'),
  mutationPath.of('widthMode'),
  mutationPath.of('wrapWidth')
]

const FIT_LAYOUT_STYLE_PATHS: readonly Path[] = [
  mutationPath.of('fontWeight'),
  mutationPath.of('fontStyle')
]

const FIT_LAYOUT_DATA_PATHS: readonly Path[] = [
  mutationPath.of('text'),
  mutationPath.of('fontMode')
]

const FONT_MODE_PATH = mutationPath.of('fontMode')
const FONT_SIZE_PATH = mutationPath.of('fontSize')

const hasTrackedPath = (
  paths: readonly Path[],
  value?: Path
) => {
  const target = value ?? mutationPath.root()
  return paths.some((path) => mutationPath.eq(path, target))
}

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

  return (update.records ?? []).some((record) => (
    record.scope === 'style'
      ? (
          kind === 'size'
            ? hasTrackedPath(SIZE_LAYOUT_STYLE_PATHS, record.path)
            : hasTrackedPath(FIT_LAYOUT_STYLE_PATHS, record.path)
        )
      : (
          kind === 'size'
            ? hasTrackedPath(SIZE_LAYOUT_DATA_PATHS, record.path)
            : hasTrackedPath(FIT_LAYOUT_DATA_PATHS, record.path)
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
    (record) => record.scope === 'data' && mutationPath.eq(record.path ?? mutationPath.root(), FONT_MODE_PATH)
  )
  const touchesFontSize = (update.records ?? []).some(
    (record) => record.scope === 'style' && mutationPath.eq(record.path ?? mutationPath.root(), FONT_SIZE_PATH)
  )

  if (!touchesFontSize || touchesFontMode) {
    return update
  }

  return schemaApi.node.mergeUpdates(
    update,
    schemaApi.node.compileDataUpdate(mutationPath.of('fontMode'), 'fixed')
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
    return nodeApi.text.shouldPatchLayout(committed.node, size)
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
      : schemaApi.node.compileStyleUpdate(mutationPath.of('fontSize'), fontSize)
  }

  return undefined
}

const buildMeasureRequest = ({
  target,
  registry
}: {
  target: TextMeasureTarget
  registry: Pick<NodeRegistry, 'get'>
}): LayoutRequest | undefined => {
  if (target.kind === 'node') {
    const kind = readLayoutKind(registry, target.node)
    if (kind !== 'size') {
      return undefined
    }

    return buildLayoutRequest({
      nodeId: target.nodeId,
      node: target.node,
      rect: target.rect,
      kind
    })
  }

  return {
    kind: 'size',
    source: {
      kind: 'edge-label',
      edgeId: target.edgeId,
      labelId: target.labelId
    },
    typography: 'edge-label',
    text: typeof target.label.text === 'string'
      ? target.label.text
      : '',
    placeholder: EDGE_LABEL_PLACEHOLDER,
    widthMode: 'auto',
    frame: EMPTY_TEXT_FRAME_INSETS,
    minWidth: 1,
    maxWidth: EDGE_LABEL_MAX_WIDTH,
    fontSize: target.label.style?.size ?? edgeApi.label.defaultSize,
    fontWeight: target.label.style?.weight,
    fontStyle: target.label.style?.italic
      ? 'italic'
      : undefined
  }
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

const measureDraftNodeLayout = ({
  committed,
  nodeId,
  field,
  text,
  registry,
  backend
}: {
  committed: {
    node: Node
    rect: Rect
  } | undefined
  nodeId: NodeId
  field: EditField
  text: string
  registry: Pick<NodeRegistry, 'get'>
  backend?: LayoutBackend
}): DraftMeasure => {
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
  const request = buildLayoutRequest({
    nodeId,
    node: nextNode,
    rect: committed.rect,
    kind
  })
  if (!request) {
    return undefined
  }

  const result = backend?.measure(request)
  return request.kind === 'size'
    ? {
        kind: 'size',
        size: result?.kind === 'size'
          ? result.size
          : {
              width: committed.rect.width,
              height: committed.rect.height
            }
      }
    : {
        kind: 'fit',
        fontSize: result?.kind === 'fit'
          ? result.fontSize
          : readFontSize(committed.node)
      }
}

export type EditorLayout = {
  text: TextMetricsResource
  measureText: (
    request: TextMeasureTarget
  ) => Size | undefined
  draft: {
    node: store.KeyedReadStore<NodeId, DraftMeasure>
  }
  patchNodeCreatePayload: (
    payload: NodeInput
  ) => NodeInput
  patchMindmapTemplate: (
    template: MindmapTemplate,
    position?: {
      x: number
      y: number
    }
  ) => MindmapTemplate
  patchNodeUpdate: (
    nodeId: NodeId,
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => NodeUpdateInput
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
      committed: EditorDocumentRuntimeSource['node']['committed']
    }
  }
  session: {
    edit: store.ReadStore<EditSession>
  }
  registry: Pick<NodeRegistry, 'get'>
  backend?: LayoutBackend
}): EditorLayout => {
  const text = createTextMetricsResource()

  const draft = {
    node: store.createKeyedDerivedStore<NodeId, DraftMeasure>({
      get: (nodeId) => {
        const current = store.read(session.edit)
        if (
          !current
          || current.kind !== 'node'
          || current.nodeId !== nodeId
        ) {
          return undefined
        }

        return measureDraftNodeLayout({
          committed: store.read(read.node.committed, nodeId),
          nodeId,
          field: current.field,
          text: current.text,
          registry,
          backend
        })
      },
      isEqual: (left, right) => left === right || (
        left !== undefined
        && right !== undefined
        && left.kind === right.kind
        && (
          left.kind === 'size' && right.kind === 'size'
            ? geometryApi.equal.size(left.size, right.size)
            : left.kind === 'fit' && right.kind === 'fit'
              ? left.fontSize === right.fontSize
              : false
        )
      )
    })
  }

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

  const measureText: EditorLayout['measureText'] = (request) => {
    const layoutRequest = buildMeasureRequest({
      target: request,
      registry
    })
    if (!layoutRequest) {
      return request.kind === 'edge-label'
        ? measureEdgeLabelFallback({
            target: request,
            text
          })
        : undefined
    }

    const result = backend?.measure(layoutRequest)
    if (result?.kind === 'size') {
      return result.size
    }

    return request.kind === 'edge-label'
      ? measureEdgeLabelFallback({
          target: request,
          text
        })
      : undefined
  }

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

    const bootstrapSize = nodeApi.bootstrap.resolve(payload) ?? {
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
      return geometryApi.equal.size(payload.size, result.size)
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

  const patchMindmapTemplateNode = (
    templateNode: MindmapTemplateNode,
    position: {
      x: number
      y: number
    }
  ): MindmapTemplateNode => ({
    ...templateNode,
    node: patchCreatePayload({
      ...templateNode.node,
      position
    }),
    children: templateNode.children?.map((child) => patchMindmapTemplateNode(child, {
      x: 0,
      y: 0
    }))
  })

  return {
    text,
    measureText,
    draft,
    patchNodeCreatePayload: patchCreatePayload,
    patchMindmapTemplate: (template, position = { x: 0, y: 0 }) => ({
      ...template,
      root: patchMindmapTemplateNode(template.root, position)
    }),
    patchNodeUpdate: (nodeId, update, options) => {
      const committed = store.read(read.node.committed, nodeId)
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

      const applied = nodeApi.update.apply(committed.node, normalized)
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

      return schemaApi.node.mergeUpdates(
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

    resolvePreviewPatches: (patches) => patches.map((patch) => {
      const committed = store.read(read.node.committed, patch.id)
      if (!backend || !committed) {
        return patch
      }

      const kind = readLayoutKind(registry, committed.node)
      if (kind === 'size') {
        if (
          committed.node.type !== 'text'
          || patch.handle === undefined
          || nodeApi.text.handle(patch.handle) !== 'reflow'
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

        const rect = nodeApi.transform.anchoredRect({
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
        || nodeApi.text.stickyFontMode(committed.node) === 'fixed'
        || !patch.size
        || geometryApi.equal.size(patch.size, committed.rect)
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
