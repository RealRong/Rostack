import { isSizeEqual } from '@whiteboard/core/geometry'
import {
  applyNodeUpdate,
  readStickyFontMode,
  readTextWrapWidth,
  readTextWidthMode,
  resolveAnchoredRect,
  resolveTextBox,
  resolveTextHandle,
  setTextWidthMode,
  setTextWrapWidth,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_PLACEHOLDER
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
  NodeUpdateInput,
  Rect,
  Size,
  Origin
} from '@whiteboard/core/types'
import type { TextPreviewPatch } from '@whiteboard/editor/local/feedback/types'
import type { EditField, EditLayout } from '@whiteboard/editor/local/session/edit'
import type { EditorQueryRead } from '@whiteboard/editor/query'
import type {
  LayoutBackend,
  LayoutKind,
  LayoutRequest
} from '@whiteboard/editor/types/layout'
import {
  readNodeTextSourceId
} from '@whiteboard/editor/types/layout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'

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

const readTextValue = (
  node: Pick<Node, 'data'>
) => typeof node.data?.text === 'string'
  ? node.data.text
  : ''

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

  const widthMode = preview.mode ?? readTextWidthMode(node)
  const dataWithMode = preview.mode === undefined
    ? node.data
    : setTextWidthMode(node, widthMode)
  const nextWrapWidth = widthMode === 'wrap'
    ? (preview.wrapWidth ?? readTextWrapWidth(node))
    : undefined
  const data = nextWrapWidth === readTextWrapWidth(node)
    ? dataWithMode
    : setTextWrapWidth({ data: dataWithMode }, nextWrapWidth)

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
    const widthMode = readTextWidthMode(node)

    return {
      kind: 'size',
      nodeId,
      sourceId: readNodeTextSourceId(nodeId, 'text'),
      text: readTextValue(node),
      placeholder: TEXT_PLACEHOLDER,
      widthMode,
      wrapWidth: widthMode === 'wrap'
        ? (readTextWrapWidth(node) ?? rect.width)
        : undefined,
      fontSize: readFontSize(node),
      fontWeight: readFontWeight(node),
      fontStyle: readFontStyle(node)
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
      sourceId: readNodeTextSourceId(nodeId, 'text'),
      text: readTextValue(node),
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
    return !isSizeEqual(size, committed.rect)
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

export type LayoutRuntime = {
  measureText: (
    input: Omit<Extract<LayoutRequest, { kind: 'text-size' }>, 'kind'>
  ) => Size | undefined
  patchNodeUpdate: (
    nodeId: NodeId,
    update: NodeUpdateInput,
    options?: {
      origin?: Origin
    }
  ) => NodeUpdateInput
  syncNode: (
    nodeId: NodeId
  ) => NodeUpdateInput | undefined
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

export const createLayoutRuntime = ({
  read,
  registry,
  backend
}: {
  read: Pick<EditorQueryRead, 'node'>
  registry: Pick<NodeRegistry, 'get'>
  backend?: LayoutBackend
}): LayoutRuntime => {
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

  return {
    measureText: (input) => {
      const result = backend?.measure({
        kind: 'text-size',
        ...input
      })

      return result?.kind === 'size'
        ? result.size
        : undefined
    },
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

    syncNode: (nodeId) => {
      const committed = read.node.committed.get(nodeId)
      if (!backend || !committed) {
        return undefined
      }

      const kind = readLayoutKind(registry, committed.node)
      if (kind === 'none') {
        return undefined
      }

      const request = resolveNodeRequest({
        nodeId,
        node: committed.node,
        rect: committed.rect
      })
      if (!request) {
        return undefined
      }

      const result = backend.measure(request)
      if (!result) {
        return undefined
      }

      return toLayoutResultUpdate({
        kind,
        committed,
        request,
        fontSize: result.kind === 'fit' ? result.fontSize : undefined,
        size: result.kind === 'size' ? result.size : undefined
      })
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
