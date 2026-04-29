import { edge as edgeApi } from '@whiteboard/core/edge'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  EdgeLabel,
  EdgeId,
  MindmapCreateInput,
  MindmapId,
  MindmapInsertInput,
  MindmapInsertPayload,
  Node,
  NodeId,
  NodeInput,
  NodeUpdateInput,
  Origin,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { TransformPreviewPatch } from '@whiteboard/core/node'

export type LayoutKind = 'none' | 'size' | 'fit'

export type LayoutNodeCatalog = Readonly<Record<string, LayoutKind>>

export type LayoutTypography =
  | 'default-text'
  | 'sticky-text'
  | 'edge-label'
  | 'frame-title'
  | 'shape-label'

export type LayoutSourceRef =
  | {
      kind: 'node'
      nodeId: NodeId
      field: 'text' | 'title'
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
    }

export type LayoutBackendRequest =
  | {
      kind: 'size'
      source?: LayoutSourceRef
      typography: LayoutTypography
      text: string
      placeholder: string
      widthMode: 'auto' | 'wrap'
      wrapWidth?: number
      frame: import('@whiteboard/core/node').TextFrameInsets
      minWidth?: number
      maxWidth?: number
      fontSize: number
      fontWeight?: number | string
      fontStyle?: string
    }
  | {
      kind: 'fit'
      source?: Extract<LayoutSourceRef, { kind: 'node' }>
      typography: LayoutTypography
      text: string
      box: Size
      minFontSize?: number
      maxFontSize?: number
      fontWeight?: number | string
      fontStyle?: string
      textAlign?: 'left' | 'center' | 'right'
    }

export type LayoutBackendResult =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }

export type LayoutBackend = {
  measure: (request: LayoutBackendRequest) => LayoutBackendResult | undefined
  dispose?: () => void
}

export type LayoutNodePreviewPatch = Omit<TransformPreviewPatch, 'id'>

export type NodeDraftMeasure =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }

export type WhiteboardLayoutCommitInput =
  | {
      kind: 'node.create'
      node: NodeInput
      position?: Point
    }
  | {
      kind: 'node.update'
      nodeId: NodeId
      node: Node
      update: NodeUpdateInput
      origin?: Origin
    }
  | {
      kind: 'node.text.commit'
      nodeId: NodeId
      node: Node
      field: 'text' | 'title'
      value: string
    }
  | {
      kind: 'mindmap.create'
      input: MindmapCreateInput
      position?: Point
    }
  | {
      kind: 'mindmap.topic.insert'
      mindmapId: MindmapId
      input: MindmapInsertInput
    }

export type WhiteboardLayoutCommitOutput =
  | {
      kind: 'node.create'
      node: NodeInput
    }
  | {
      kind: 'node.update'
      update: NodeUpdateInput
    }
  | {
      kind: 'node.text.commit'
      update?: NodeUpdateInput
    }
  | {
      kind: 'mindmap.create'
      input: MindmapCreateInput
    }
  | {
      kind: 'mindmap.topic.insert'
      input: MindmapInsertInput
    }

export type WhiteboardLayoutRuntimeInput =
  | {
      kind: 'node.draft'
      nodeId: NodeId
      node: Node
      rect: Rect
      preview?: LayoutNodePreviewPatch
      draft: {
        field: 'text' | 'title'
        value: string
      }
    }
  | {
      kind: 'node.transform'
      patches: readonly TransformPreviewPatch[]
      readNode: (id: NodeId) => Node | undefined
      readRect: (id: NodeId) => Rect | undefined
    }
  | {
      kind: 'edge.label'
      edgeId: EdgeId
      labelId: string
      label: EdgeLabel
    }

export type WhiteboardLayoutRuntimeOutput =
  | {
      kind: 'node.draft'
      measure?: NodeDraftMeasure
    }
  | {
      kind: 'node.transform'
      patches: readonly TransformPreviewPatch[]
    }
  | {
      kind: 'edge.label'
      size?: Size
    }

type LayoutCommitInputOf<
  K extends WhiteboardLayoutCommitInput['kind']
> = Extract<WhiteboardLayoutCommitInput, { kind: K }>

type LayoutCommitOutputOf<
  K extends WhiteboardLayoutCommitOutput['kind']
> = Extract<WhiteboardLayoutCommitOutput, { kind: K }>

type LayoutRuntimeInputOf<
  K extends WhiteboardLayoutRuntimeInput['kind']
> = Extract<WhiteboardLayoutRuntimeInput, { kind: K }>

type LayoutRuntimeOutputOf<
  K extends WhiteboardLayoutRuntimeOutput['kind']
> = Extract<WhiteboardLayoutRuntimeOutput, { kind: K }>

export type WhiteboardLayoutService = {
  commit: <K extends WhiteboardLayoutCommitInput['kind']>(
    input: LayoutCommitInputOf<K>
  ) => LayoutCommitOutputOf<K>
  runtime: <K extends WhiteboardLayoutRuntimeInput['kind']>(
    input: LayoutRuntimeInputOf<K>
  ) => LayoutRuntimeOutputOf<K>
}

const TEXT_PLACEHOLDER = 'Text'
const EDGE_LABEL_PLACEHOLDER = 'Label'
const FONT_MODE_PATH = 'fontMode'
const FONT_SIZE_PATH = 'fontSize'

const SIZE_LAYOUT_STYLE_PATHS = [
  'fontSize',
  'fontWeight',
  'fontStyle'
] as const

const SIZE_LAYOUT_DATA_PATHS = [
  'text',
  'widthMode',
  'wrapWidth'
] as const

const FIT_LAYOUT_STYLE_PATHS = [
  'fontWeight',
  'fontStyle'
] as const

const FIT_LAYOUT_DATA_PATHS = [
  'text',
  'fontMode'
] as const

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(value, key)

const hasTrackedPath = (
  paths: readonly string[],
  value?: string
) => {
  const target = value ?? ''
  return paths.some((path) => path === target)
}

const readLayoutKind = (
  catalog: LayoutNodeCatalog,
  type?: string
): LayoutKind => type
  ? (catalog[type] ?? 'none')
  : 'none'

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
    position?: LayoutNodePreviewPatch['position']
    size?: LayoutNodePreviewPatch['size']
  }
): Rect => ({
  x: fields?.position?.x ?? rect.x,
  y: fields?.position?.y ?? rect.y,
  width: fields?.size?.width ?? rect.width,
  height: fields?.size?.height ?? rect.height
})

const applyPreviewNode = (
  node: Node,
  preview: LayoutNodePreviewPatch
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

const buildNodeLayoutRequest = (input: {
  nodeId?: NodeId
  node: Node
  rect: Rect
  kind: LayoutKind
}): LayoutBackendRequest | undefined => {
  if (input.kind === 'size' && input.node.type === 'text') {
    const layoutInput = nodeApi.text.layoutInput(input.node, {
      width: input.rect.width,
      height: input.rect.height
    })
    if (!layoutInput) {
      return undefined
    }

    return {
      kind: 'size',
      source: input.nodeId
        ? {
            kind: 'node',
            nodeId: input.nodeId,
            field: 'text'
          }
        : undefined,
      typography: 'default-text',
      text: layoutInput.text,
      placeholder: TEXT_PLACEHOLDER,
      widthMode: layoutInput.widthMode,
      wrapWidth: layoutInput.wrapWidth,
      frame: layoutInput.frame,
      minWidth: layoutInput.minWidth,
      maxWidth: layoutInput.maxWidth,
      fontSize: layoutInput.fontSize,
      fontWeight: layoutInput.fontWeight,
      fontStyle: layoutInput.fontStyle
    }
  }

  if (
    input.kind === 'fit'
    && input.node.type === 'sticky'
    && nodeApi.text.stickyFontMode(input.node) === 'auto'
  ) {
    return {
      kind: 'fit',
      source: input.nodeId
        ? {
            kind: 'node',
            nodeId: input.nodeId,
            field: 'text'
          }
        : undefined,
      typography: 'sticky-text',
      text: typeof input.node.data?.text === 'string'
        ? input.node.data.text
        : '',
      box: nodeApi.text.box('sticky', input.rect),
      fontWeight: readFontWeight(input.node),
      fontStyle: readFontStyle(input.node),
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

const normalizeStickyFontModeUpdate = (input: {
  node: Node
  update: NodeUpdateInput
  origin?: Origin
}) => {
  if (input.node.type !== 'sticky' || input.origin === 'system') {
    return input.update
  }

  const recordKeys = Object.keys(input.update.record ?? {})
  const touchesFontMode = recordKeys.includes(`data.${FONT_MODE_PATH}`)
  const touchesFontSize = recordKeys.includes(`style.${FONT_SIZE_PATH}`)

  if (!touchesFontSize || touchesFontMode) {
    return input.update
  }

  return nodeApi.update.merge(
    input.update,
    {
      record: {
        'data.fontMode': 'fixed'
      }
    }
  )
}

const measureNode = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  nodeId?: NodeId
  node: Node
  rect: Rect
}): LayoutBackendResult | undefined => {
  const request = buildNodeLayoutRequest({
    nodeId: input.nodeId,
    node: input.node,
    rect: input.rect,
    kind: readLayoutKind(input.catalog, input.node.type)
  })
  return request
    ? input.backend.measure(request)
    : undefined
}

const normalizeNodeCreate = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  node: NodeInput
  position?: Point
}): NodeInput => {
  if (!input.node.type) {
    return input.node
  }

  const kind = readLayoutKind(input.catalog, input.node.type)
  if (kind === 'none') {
    return input.node
  }

  const bootstrapSize = nodeApi.bootstrap.resolve(input.node) ?? {
    width: 1,
    height: 1
  }
  const position = input.position ?? input.node.position ?? {
    x: 0,
    y: 0
  }
  const node: Node = {
    id: input.node.id ?? '__layout_create__',
    type: input.node.type,
    position,
    size: input.node.size ?? bootstrapSize,
    rotation: input.node.rotation,
    locked: input.node.locked,
    data: input.node.data,
    style: input.node.style
  }
  const result = measureNode({
    backend: input.backend,
    catalog: input.catalog,
    nodeId: node.id,
    node,
    rect: {
      x: position.x,
      y: position.y,
      width: node.size.width,
      height: node.size.height
    }
  })

  if (result?.kind === 'size') {
    return geometryApi.equal.size(input.node.size, result.size)
      ? input.node
      : {
          ...input.node,
          size: result.size
        }
  }

  if (result?.kind === 'fit') {
    const currentFontSize = typeof input.node.style?.fontSize === 'number'
      ? input.node.style.fontSize
      : undefined
    if (currentFontSize === result.fontSize) {
      return input.node
    }

    return {
      ...input.node,
      style: {
        ...(input.node.style ?? {}),
        fontSize: result.fontSize
      }
    }
  }

  return input.node
}

const normalizeNodeUpdate = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  nodeId: NodeId
  node: Node
  update: NodeUpdateInput
  origin?: Origin
}): NodeUpdateInput => {
  const kind = readLayoutKind(input.catalog, input.node.type)
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

  const currentRect = {
    x: input.node.position.x,
    y: input.node.position.y,
    width: input.node.size.width,
    height: input.node.size.height
  }
  const nextRect = patchRect(currentRect, normalized.fields)
  const result = measureNode({
    backend: input.backend,
    catalog: input.catalog,
    nodeId: input.nodeId,
    node: applied.next,
    rect: nextRect
  })

  return nodeApi.update.merge(
    normalized,
    result?.kind === 'size'
      ? (
          nodeApi.text.shouldPatchLayout(input.node, result.size)
            ? {
                fields: {
                  size: result.size
                }
              }
            : undefined
        )
      : result?.kind === 'fit'
        ? (
            (typeof input.node.style?.fontSize === 'number'
              ? input.node.style.fontSize
              : undefined) === result.fontSize
              ? undefined
              : {
                  record: {
                    'style.fontSize': result.fontSize
                  }
                }
          )
        : undefined
  )
}

const normalizeNodeTextCommit = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  nodeId: NodeId
  node: Node
  field: 'text' | 'title'
  value: string
}): NodeUpdateInput | undefined => {
  const currentValue = typeof input.node.data?.[input.field] === 'string'
    ? input.node.data[input.field] as string
    : ''
  const update = input.value === currentValue
    ? undefined
    : {
        record: {
          [`data.${input.field}`]: input.value
        }
      } satisfies NodeUpdateInput
  const normalized = normalizeNodeUpdate({
    backend: input.backend,
    catalog: input.catalog,
    nodeId: input.nodeId,
    node: input.node,
    update: update ?? {}
  })

  return nodeApi.update.isEmpty(normalized)
    ? undefined
    : normalized
}

const createTopicData = (
  payload?: MindmapInsertPayload | {
    kind: string
    [key: string]: unknown
  }
) => {
  if (!payload) {
    return {
      text: 'Topic'
    }
  }

  switch (payload.kind) {
    case 'text':
      return {
        text: typeof payload.text === 'string' ? payload.text : 'Topic'
      }
    case 'file':
      return {
        fileId: payload.fileId,
        name: payload.name
      }
    case 'link':
      return {
        url: payload.url,
        title: payload.title
      }
    case 'ref':
      return {
        ref: payload.ref,
        title: payload.title
      }
    default:
      return {
        ...payload
      }
  }
}

const normalizeMindmapTemplate = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  template: import('@whiteboard/core/types').MindmapTemplate
  position?: Point
}): import('@whiteboard/core/types').MindmapTemplate => {
  const patchNode = (
    templateNode: import('@whiteboard/core/types').MindmapTemplateNode,
    position: Point
  ): import('@whiteboard/core/types').MindmapTemplateNode => ({
    ...templateNode,
    node: normalizeNodeCreate({
      backend: input.backend,
      catalog: input.catalog,
      node: {
        ...templateNode.node,
        position
      },
      position
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

const normalizeMindmapCreate = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  value: MindmapCreateInput
  position?: Point
}): MindmapCreateInput => ({
  ...input.value,
  template: normalizeMindmapTemplate({
    backend: input.backend,
    catalog: input.catalog,
    template: input.value.template,
    position: input.position ?? input.value.position
  })
})

const normalizeMindmapTopicInsert = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  value: MindmapInsertInput
}): MindmapInsertInput => {
  const seed = normalizeNodeCreate({
    backend: input.backend,
    catalog: input.catalog,
    node: {
      type: input.value.node?.type ?? 'text',
      position: { x: 0, y: 0 },
      size: input.value.node?.size,
      rotation: input.value.node?.rotation,
      locked: input.value.node?.locked,
      style: input.value.node?.style,
      data: {
        ...(input.value.node?.data ?? {}),
        ...createTopicData(input.value.payload)
      }
    },
    position: { x: 0, y: 0 }
  })

  return {
    ...input.value,
    node: {
      type: seed.type === 'frame'
        ? undefined
        : seed.type,
      data: seed.data,
      style: seed.style,
      size: seed.size,
      rotation: seed.rotation,
      locked: seed.locked
    }
  }
}

const measureNodeDraft = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  nodeId: NodeId
  node: Node
  rect: Rect
  preview?: LayoutNodePreviewPatch
  draft: {
    field: 'text' | 'title'
    value: string
  }
}): NodeDraftMeasure | undefined => {
  const previewItem = nodeApi.patch.applyTextPreview({
    node: input.node,
    rect: input.rect
  }, input.preview)
  const contentItem = nodeApi.patch.applyTextDraft(previewItem, {
    field: input.draft.field,
    value: input.draft.value
  })

  const result = measureNode({
    backend: input.backend,
    catalog: input.catalog,
    nodeId: input.nodeId,
    node: contentItem.node,
    rect: contentItem.rect
  })

  return result?.kind === 'size'
    ? {
        kind: 'size',
        size: result.size
      }
    : result?.kind === 'fit'
      ? {
          kind: 'fit',
          fontSize: result.fontSize
        }
      : undefined
}

const measureEdgeLabelSize = (input: {
  backend: LayoutBackend
  edgeId: EdgeId
  labelId: string
  label: EdgeLabel
}): Size | undefined => {
  const result = input.backend.measure({
    kind: 'size',
    source: {
      kind: 'edge-label',
      edgeId: input.edgeId,
      labelId: input.labelId
    },
    typography: 'edge-label',
    text: typeof input.label.text === 'string'
      ? input.label.text
      : '',
    placeholder: EDGE_LABEL_PLACEHOLDER,
    widthMode: 'auto',
    frame: {
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      borderTop: 0,
      borderRight: 0,
      borderBottom: 0,
      borderLeft: 0
    },
    minWidth: 1,
    maxWidth: 4096,
    fontSize: input.label.style?.size ?? edgeApi.label.defaultSize,
    fontWeight: input.label.style?.weight,
    fontStyle: input.label.style?.italic
      ? 'italic'
      : undefined
  })

  return result.kind === 'size'
    ? result.size
    : undefined
}

const projectNodeTransformPatches = (input: {
  backend: LayoutBackend
  catalog: LayoutNodeCatalog
  patches: readonly TransformPreviewPatch[]
  readNode: (id: NodeId) => Node | undefined
  readRect: (id: NodeId) => Rect | undefined
}): readonly TransformPreviewPatch[] => input.patches.map((patch) => {
  const node = input.readNode(patch.id)
  const rect = input.readRect(patch.id)
  if (!node || !rect) {
    return patch
  }

  const kind = readLayoutKind(input.catalog, node.type)
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
    const result = measureNode({
      backend: input.backend,
      catalog: input.catalog,
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

  const result = measureNode({
    backend: input.backend,
    catalog: input.catalog,
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

export const createWhiteboardLayout = (input: {
  nodes: LayoutNodeCatalog
  backend: LayoutBackend
}): WhiteboardLayoutService => {
  const commit: WhiteboardLayoutService['commit'] = (value) => {
    switch (value.kind) {
      case 'node.create':
        return {
          kind: 'node.create',
          node: normalizeNodeCreate({
            backend: input.backend,
            catalog: input.nodes,
            node: value.node,
            position: value.position
          })
        }
      case 'node.update':
        return {
          kind: 'node.update',
          update: normalizeNodeUpdate({
            backend: input.backend,
            catalog: input.nodes,
            nodeId: value.nodeId,
            node: value.node,
            update: value.update,
            origin: value.origin
          })
        }
      case 'node.text.commit':
        return {
          kind: 'node.text.commit',
          update: normalizeNodeTextCommit({
            backend: input.backend,
            catalog: input.nodes,
            nodeId: value.nodeId,
            node: value.node,
            field: value.field,
            value: value.value
          })
        }
      case 'mindmap.create':
        return {
          kind: 'mindmap.create',
          input: normalizeMindmapCreate({
            backend: input.backend,
            catalog: input.nodes,
            value: value.input,
            position: value.position
          })
        }
      case 'mindmap.topic.insert':
        return {
          kind: 'mindmap.topic.insert',
          input: normalizeMindmapTopicInsert({
            backend: input.backend,
            catalog: input.nodes,
            value: value.input
          })
        }
    }
  }

  const runtime: WhiteboardLayoutService['runtime'] = (value) => {
    switch (value.kind) {
      case 'node.draft':
        return {
          kind: 'node.draft',
          measure: measureNodeDraft({
            backend: input.backend,
            catalog: input.nodes,
            nodeId: value.nodeId,
            node: value.node,
            rect: value.rect,
            preview: value.preview,
            draft: value.draft
          })
        }
      case 'node.transform':
        return {
          kind: 'node.transform',
          patches: projectNodeTransformPatches({
            backend: input.backend,
            catalog: input.nodes,
            patches: value.patches,
            readNode: value.readNode,
            readRect: value.readRect
          })
        }
      case 'edge.label':
        return {
          kind: 'edge.label',
          size: measureEdgeLabelSize({
            backend: input.backend,
            edgeId: value.edgeId,
            labelId: value.labelId,
            label: value.label
          })
        }
    }
  }

  return {
    commit,
    runtime
  }
}
