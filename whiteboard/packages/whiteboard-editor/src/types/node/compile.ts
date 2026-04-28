import {
  key,
  spec as specApi
} from '@shared/spec'
import type {
  TableSpecIndex
} from '@shared/spec'
import type {
  NodeSchema,
  NodeType,
  SchemaField,
  SchemaFieldScope
} from '@whiteboard/core/types'
import type {
  NodeFieldSpec,
  NodeMeta,
  NodeSpec,
  NodeSpecEntry,
  NodeStyleFieldKey
} from '@whiteboard/editor/types/node/spec'
import type {
  NodeStyleFieldKind,
  NodeTypeCapability
} from '@whiteboard/editor/types/node/read'

const EMPTY_CONTROLS: readonly NodeMeta['controls'][number][] = []
const EMPTY_STYLE_FIELDS = Object.freeze({})
const fieldKey = key.path()
type NodeTypeKey<TSpec extends NodeSpec> = Extract<keyof TSpec, string>
type NodeBehaviorOf<TSpec extends NodeSpec> = TSpec[NodeTypeKey<TSpec>]['behavior']

export type CompiledNodeSpec<TSpec extends NodeSpec = NodeSpec> = {
  entryByType: TableSpecIndex<TSpec, undefined>
  metaByType: TableSpecIndex<
    Readonly<Record<NodeTypeKey<TSpec>, NodeMeta>>,
    undefined
  >
  schemaByType: TableSpecIndex<
    Readonly<Record<string, NodeSchema>>,
    undefined
  >
  behaviorByType: TableSpecIndex<
    Readonly<Record<NodeTypeKey<TSpec>, NodeBehaviorOf<TSpec>>>,
    undefined
  >
  capabilityByType: TableSpecIndex<
    Readonly<Record<NodeTypeKey<TSpec>, NodeTypeCapability>>,
    NodeTypeCapability
  >
  styleFieldKindByType: {
    resolve(type: string): Readonly<Record<NodeStyleFieldKey, NodeStyleFieldKind>>
  }
  controlsByType: TableSpecIndex<
    Readonly<Record<NodeTypeKey<TSpec>, readonly NodeMeta['controls'][number][]>>,
    readonly NodeMeta['controls'][number][]
  >
}

const isCoreNodeType = (
  type: string
): type is NodeType => (
  type === 'text'
  || type === 'sticky'
  || type === 'shape'
  || type === 'draw'
  || type === 'frame'
)

const readFallbackCapability = (): NodeTypeCapability => ({
  role: 'content',
  connect: true,
  enter: false,
  resize: true,
  rotate: true
})

const readStyleFieldKind = (
  field: NodeFieldSpec
): NodeStyleFieldKind => {
  if (field.kind) {
    return field.kind
  }

  return field.type === 'number'
    ? 'number'
    : 'string'
}

const parseFieldKey = (
  key: string
): {
  scope: SchemaFieldScope
  path: string
} => {
  const [scope, ...path] = fieldKey.read(key)

  if (
    scope !== 'data'
    && scope !== 'style'
    && scope !== 'label'
  ) {
    throw new Error(`Invalid node field key scope: ${key}`)
  }

  if (!path.length) {
    throw new Error(`Invalid node field key path: ${key}`)
  }

  return {
    scope,
    path: fieldKey.write(path)
  }
}

const compileSchemaField = (
  key: string,
  field: NodeFieldSpec
): SchemaField => {
  const {
    scope,
    path
  } = parseFieldKey(key)
  const {
    kind: _kind,
    ...schemaField
  } = field

  return {
    id: key,
    scope,
    path,
    ...schemaField,
    ...(schemaField.options
      ? {
          options: [...schemaField.options]
        }
      : {})
  }
}

const compileNodeSchema = (
  type: string,
  entry: NodeSpecEntry
): NodeSchema | undefined => {
  if (!entry.schema || !isCoreNodeType(type)) {
    return undefined
  }

  return {
    type,
    label: entry.meta.name,
    fields: Object.entries(entry.schema.fields).map(([key, field]) => (
      compileSchemaField(key, field)
    ))
  }
}

const compileNodeCapability = (
  entry: NodeSpecEntry | undefined
): NodeTypeCapability => {
  const behavior = entry?.behavior
  const role = behavior?.role ?? 'content'

  return {
    role,
    connect: behavior?.connect ?? true,
    enter: behavior?.enter ?? false,
    resize: behavior?.resize ?? true,
    rotate:
      typeof behavior?.rotate === 'boolean'
        ? behavior.rotate
        : role === 'content'
  }
}

const compileStyleFieldKinds = (
  entry: NodeSpecEntry | undefined
) => {
  if (!entry?.schema) {
    return EMPTY_STYLE_FIELDS
  }

  return Object.fromEntries(
    Object.entries(entry.schema.fields).flatMap(([key, field]) => {
      const {
        scope
      } = parseFieldKey(key)

      return scope === 'style'
        ? [[key, readStyleFieldKind(field)]]
        : []
    })
  )
}

export const compileNodeSpec = <
  TSpec extends NodeSpec
>(
  spec: TSpec
): CompiledNodeSpec<TSpec> => {
  const entryByType = specApi.table(spec, {
    fallback: () => undefined
  })
  const metaByType = specApi.table(
    entryByType.project(([, entry]) => entry.meta),
    {
      fallback: () => undefined
    }
  )
  const schemaByType = specApi.table(
    Object.fromEntries(
      entryByType.entries.flatMap(([type, entry]) => {
        const schema = compileNodeSchema(type, entry)
        return schema
          ? [[type, schema]]
          : []
      })
    ),
    {
      fallback: () => undefined
    }
  )
  const behaviorByType = specApi.table(
    entryByType.project(([, entry]) => entry.behavior),
    {
      fallback: () => undefined
    }
  )
  const capabilityByType = specApi.table(
    entryByType.project(([, entry]) => compileNodeCapability(entry)),
    {
      fallback: readFallbackCapability
    }
  )
  const styleFieldKindByType = specApi.table(
    entryByType.project(([, entry]) => compileStyleFieldKinds(entry)),
    {
      fallback: () => EMPTY_STYLE_FIELDS
    }
  )
  const controlsByType = specApi.table(
    entryByType.project(([, entry]) => entry.meta.controls),
    {
      fallback: () => EMPTY_CONTROLS
    }
  )

  return {
    entryByType,
    metaByType,
    schemaByType,
    behaviorByType,
    capabilityByType,
    styleFieldKindByType: {
      resolve: (type: string): Readonly<Record<NodeStyleFieldKey, NodeStyleFieldKind>> => (
        styleFieldKindByType.resolve(type)
      )
    },
    controlsByType
  } as const
}
