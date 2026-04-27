import { draft } from '@shared/draft'
import { splitDotKey } from '@shared/spec'
import type {
  Node,
  NodeType
} from '@whiteboard/core/types'
import type {
  EditCapability,
  EditField
} from '@whiteboard/editor/session/edit'
import type {
  ControlId,
  NodeMeta,
  NodeSpec,
  NodeStyleFieldKey
} from '@whiteboard/editor/types/node/spec'
import type {
  NodeStyleFieldKind,
  NodeTypeCapability,
  NodeTypeRead,
  NodeTypeSupport
} from '@whiteboard/editor/types/node/read'
import { compileNodeSpec } from '@whiteboard/editor/types/node/compile'

const EMPTY_CONTROLS: readonly ControlId[] = []

const readStyleValue = (
  node: Pick<Node, 'style'>,
  field: NodeStyleFieldKey
) => {
  const [, ...path] = splitDotKey(field)
  return draft.path.get(node.style, path)
}

const readFallbackMeta = (
  type: NodeType
): NodeMeta => ({
  type,
  name: type,
  family: 'shape',
  icon: type,
  controls: EMPTY_CONTROLS
})

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

const readDefinitionCapability = (
  capability: NodeTypeCapability
): NodeTypeCapability => {
  return capability
}

export const resolveNodeEditorCapability = (
  node: Pick<Node, 'id' | 'type' | 'owner'>,
  type: Pick<NodeTypeSupport, 'capability'>
): NodeTypeCapability => {
  const base = type.capability(node.type)
  const mindmapOwned = node.owner?.kind === 'mindmap'

  return {
    ...base,
    connect: base.connect,
    resize: !mindmapOwned && base.resize,
    rotate: !mindmapOwned && base.rotate
  }
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

    const next = compiled.metaByType.resolve(type) ?? readFallbackMeta(type)
    metaCache.set(type, next)
    return next
  }

  const capability: NodeTypeRead['capability'] = (type) => {
    const cached = capabilityCache.get(type)
    if (cached) {
      return cached
    }

    const next = readDefinitionCapability(compiled.capabilityByType.resolve(type))
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
