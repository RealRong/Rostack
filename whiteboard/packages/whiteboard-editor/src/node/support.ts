import { record as draftRecord } from '@shared/draft'
import { key } from '@shared/spec'
import type {
  Node,
  NodeType
} from '@whiteboard/core/types'
import type {
  EditCapability,
  EditField
} from '@whiteboard/editor/schema/edit'
import type {
  ControlId,
  NodeMeta,
  NodeSpec,
  NodeStyleFieldKey
} from '@whiteboard/editor/node/spec'
import type {
  NodeStyleFieldKind,
  NodeTypeCapability,
  NodeTypeRead,
  NodeTypeSupport
} from '@whiteboard/editor/node/read'
import { compileNodeSpec } from '@whiteboard/editor/node/compile'

const EMPTY_CONTROLS: readonly ControlId[] = []
const fieldKey = key.path()

const readStyleValue = (
  node: Pick<Node, 'style'>,
  field: NodeStyleFieldKey
) => {
  const [, ...path] = fieldKey.read(field)
  return draftRecord.read(node.style, fieldKey.write(path))
}

const readStyleValueMatchesKind = (
  value: unknown,
  kind: NodeStyleFieldKind
) => {
  if (kind === 'string') {
    return typeof value === 'string'
  }
  if (kind === 'number') {
    return typeof value === 'number'
  }

  return Array.isArray(value) && value.every((entry) => typeof entry === 'number')
}
export const createNodeTypeSupport = (
  spec: NodeSpec
): NodeTypeSupport => {
  const compiled = compileNodeSpec(spec)
  const metaCache = new Map<NodeType, NodeMeta>()
  const capabilityCache = new Map<NodeType, NodeTypeCapability>()
  const editCache = new Map<string, EditCapability | undefined>()
  const styleSupportCache = new Map<string, boolean>()

  const readDefinition = (
    type: NodeType
  ) => compiled.entryByType.resolve(type)

  const meta: NodeTypeRead['meta'] = (type) => {
    const cached = metaCache.get(type)
    if (cached) {
      return cached
    }

    const next = compiled.metaByType.resolve(type) ?? {
      type,
      name: type,
      family: 'shape',
      icon: type,
      controls: EMPTY_CONTROLS
    } satisfies NodeMeta
    metaCache.set(type, next)
    return next
  }

  const capability: NodeTypeRead['capability'] = (type) => {
    const cached = capabilityCache.get(type)
    if (cached) {
      return cached
    }

    const next = compiled.capabilityByType.resolve(type)
    capabilityCache.set(type, next)
    return next
  }

  const edit: NodeTypeRead['edit'] = (type, field) => {
    const cacheKey = `${type}\u0001${field}`
    if (editCache.has(cacheKey)) {
      return editCache.get(cacheKey)
    }

    const next = readDefinition(type)?.behavior.edit?.fields?.[field]
    editCache.set(cacheKey, next)
    return next
  }

  return {
    meta,
    capability,
    edit,
    support: (node) => {
      const base = capability(node.type)
      const mindmapOwned = node.owner?.kind === 'mindmap'

      return {
        ...base,
        resize: !mindmapOwned && base.resize,
        rotate: !mindmapOwned && base.rotate
      }
    },
    hasControl: (node, control) => meta(node.type).controls.includes(control),
    supportsStyle: (node: Pick<Node, 'type' | 'style'>, field, kind) => {
      const cacheKey = `${node.type}\u0001${field}\u0001${kind}`
      const cached = styleSupportCache.get(cacheKey)
      if (cached !== undefined) {
        return cached || readStyleValueMatchesKind(readStyleValue(node, field), kind)
      }

      const supported = compiled.styleFieldKindByType.resolve(node.type)[field] === kind

      styleSupportCache.set(cacheKey, supported)
      return supported || readStyleValueMatchesKind(readStyleValue(node, field), kind)
    }
  }
}
