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
import type { TextPreviewPatch } from '@whiteboard/editor/session/preview/types'
import type { EditField, EditSession } from '@whiteboard/editor/session/edit'
import type { MindmapPreviewState } from '@whiteboard/editor/session/preview/types'
import { equal, store } from '@shared/core'
import type {
  LayoutBackend,
  LayoutKind,
  LayoutRequest,
  TextMetricsResource
} from '@whiteboard/editor/types/layout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
import {
  createMindmapLayoutRead,
  type MindmapLayoutRead,
  type MindmapLiveLayoutInput
} from '@whiteboard/editor/layout/mindmap'
import {
  createTextMetricsResource
} from '@whiteboard/editor/layout/textMetrics'
import type { EngineRead } from '@whiteboard/engine'

const TEXT_PLACEHOLDER = 'Text'

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

const MINDMAP_EDIT_DEBUG_PREFIX = '[mindmap-edit-debug]'

const debugMindmapEdit = (
  label: string,
  payload: unknown
) => {
  console.log(MINDMAP_EDIT_DEBUG_PREFIX, label, payload)
}

const toDebugSize = (
  size: Size | undefined
) => size
  ? {
      width: size.width,
      height: size.height
    }
  : undefined

const toDebugNodeSizes = (
  nodeSizes: ReadonlyMap<NodeId, Size>
) => Object.fromEntries(
  [...nodeSizes].map(([nodeId, size]) => [
    nodeId,
    toDebugSize(size)
  ])
)

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

  return schemaApi.node.mergeUpdates(
    update,
    schemaApi.node.compileDataUpdate('fontMode', 'fixed')
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
      : schemaApi.node.compileStyleUpdate('fontSize', fontSize)
  }

  return undefined
}

export type DraftMeasure =
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }
  | undefined

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
  const measured: DraftMeasure = request.kind === 'size'
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

  if (committed.node.owner?.kind === 'mindmap') {
    debugMindmapEdit('draft.measure', {
      treeId: committed.node.owner.id,
      nodeId,
      field,
      text,
      textLength: text.length,
      committedRect: committed.rect,
      request: request.kind === 'size'
        ? {
            kind: request.kind,
            widthMode: request.widthMode,
            wrapWidth: request.wrapWidth,
            frame: request.frame,
            minWidth: request.minWidth,
            maxWidth: request.maxWidth,
            fontSize: request.fontSize,
            fontWeight: request.fontWeight,
            fontStyle: request.fontStyle
          }
        : {
            kind: request.kind,
            box: request.box,
            minFontSize: request.minFontSize,
            maxFontSize: request.maxFontSize,
            textAlign: request.textAlign
          },
      measured: measured?.kind === 'size'
        ? {
            kind: measured.kind,
            size: toDebugSize(measured.size)
          }
        : measured?.kind === 'fit'
          ? {
              kind: measured.kind,
              fontSize: measured.fontSize
            }
          : undefined
    })
  }

  return measured
}

export type EditorLayout = {
  text: TextMetricsResource
  draft: {
    node: store.KeyedReadStore<NodeId, DraftMeasure>
  }
  mindmap: MindmapLayoutRead
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
      committed: EngineRead['node']['committed']
    }
    mindmap: {
      list: EngineRead['mindmap']['list']
      committed: EngineRead['mindmap']['layout']
      structure: EngineRead['mindmap']['structure']
    }
  }
  session: {
    edit: store.ReadStore<EditSession>
    mindmapPreview: store.ReadStore<MindmapPreviewState | undefined>
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

  const liveMindmapLayout = store.createKeyedDerivedStore<NodeId, MindmapLiveLayoutInput | undefined>({
    get: (treeId) => {
      const current = store.read(session.edit)
      if (
        !current
        || current.kind !== 'node'
        || current.field !== 'text'
      ) {
        return undefined
      }

      const node = store.read(read.node.committed, current.nodeId)?.node
      if (
        !node
        || node.owner?.kind !== 'mindmap'
        || node.owner.id !== treeId
      ) {
        return undefined
      }

      const measured = store.read(draft.node, current.nodeId)
      const size = measured?.kind === 'size'
        ? measured.size
        : undefined

      const projected = size
        ? {
            nodeSizes: new Map([[current.nodeId, size]])
          }
        : undefined

      debugMindmapEdit('draft.live-layout', {
        treeId,
        nodeId: current.nodeId,
        field: current.field,
        text: current.text,
        textLength: current.text.length,
        measured: measured?.kind === 'size'
          ? {
              kind: measured.kind,
              size: toDebugSize(measured.size)
            }
          : measured?.kind === 'fit'
            ? {
                kind: measured.kind,
                fontSize: measured.fontSize
              }
            : undefined,
        liveNodeSizes: projected
          ? toDebugNodeSizes(projected.nodeSizes)
          : undefined
      })

      return projected
    },
    isEqual: (left, right) => left === right || (
      left !== undefined
      && right !== undefined
      && left.nodeSizes.size === right.nodeSizes.size
      && [...left.nodeSizes].every(([nodeId, size]) => (
        geometryApi.equal.size(size, right.nodeSizes.get(nodeId))
      ))
    )
  })

  const mindmap = createMindmapLayoutRead({
    list: read.mindmap.list,
    committed: read.mindmap.committed,
    structure: read.mindmap.structure,
    nodeCommitted: read.node.committed,
    liveLayout: liveMindmapLayout,
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
    draft,
    mindmap,
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
