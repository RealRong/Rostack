import type {
  Node,
  NodeType
} from '@whiteboard/core/types'
import type {
  ControlId,
  NodeDefinition,
  NodeMeta,
  NodeRegistry
} from '@whiteboard/editor/types/node/registry'
import type {
  NodeStyleFieldKind,
  NodeTypeCapability,
  NodeTypeRead,
  NodeTypeSupport
} from '@whiteboard/editor/types/node/read'

const EMPTY_CONTROLS: readonly ControlId[] = []

const readFallbackMeta = (
  type: NodeType
): NodeMeta => ({
  key: type,
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
  definition: NodeDefinition | undefined
): NodeTypeCapability => {
  const role = definition?.role ?? 'content'

  return {
    role,
    connect: definition?.connect ?? true,
    enter: definition?.enter ?? false,
    resize: definition?.resize ?? true,
    rotate:
      typeof definition?.rotate === 'boolean'
        ? definition.rotate
        : role === 'content'
  }
}

export const createNodeTypeSupport = (
  registry: NodeRegistry
): NodeTypeSupport => {
  const metaCache = new Map<NodeType, NodeMeta>()
  const capabilityCache = new Map<NodeType, NodeTypeCapability>()
  const styleSupportCache = new Map<string, boolean>()

  const readDefinition = (
    type: NodeType
  ) => registry.get(type)

  const meta: NodeTypeRead['meta'] = (type) => {
    const cached = metaCache.get(type)
    if (cached) {
      return cached
    }

    const next = readDefinition(type)?.meta ?? readFallbackMeta(type)
    metaCache.set(type, next)
    return next
  }

  const capability: NodeTypeRead['capability'] = (type) => {
    const cached = capabilityCache.get(type)
    if (cached) {
      return cached
    }

    const next = readDefinitionCapability(
      readDefinition(type)
    )
    capabilityCache.set(type, next)
    return next
  }

  return {
    meta,
    capability,
    hasControl: (node, control) => meta(node.type).controls.includes(control),
    supportsStyle: (node: Pick<Node, 'type' | 'style'>, path, kind) => {
      const cacheKey = `${node.type}\u0001${path}\u0001${kind}`
      const cached = styleSupportCache.get(cacheKey)
      if (cached !== undefined) {
        return cached || readStyleValueMatchesKind(node.style?.[path], kind)
      }

      const supported = readDefinition(node.type)?.schema?.fields.some((field) => (
        field.scope === 'style'
        && field.path === path
      )) ?? false

      styleSupportCache.set(cacheKey, supported)
      return supported || readStyleValueMatchesKind(node.style?.[path], kind)
    }
  }
}
