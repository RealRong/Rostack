import {
  getCompiledMutationNode,
  type MutationShapeNode,
} from '@shared/mutation'
import {
  dataviewMutationSchema,
} from './schema'
import type {
  DataviewQueryAspect,
} from './change'

const shape = dataviewMutationSchema.shape

const nodeIdOf = (
  node: MutationShapeNode
): number => getCompiledMutationNode(dataviewMutationSchema, node).nodeId

const nodeIdSetOf = (
  nodes: readonly MutationShapeNode[]
): ReadonlySet<number> => new Set(nodes.map(nodeIdOf))

const fieldSchemaNodes = [
  shape.fields,
  shape.fields.shape.name,
  shape.fields.shape.kind,
  shape.fields.shape.displayFullUrl,
  shape.fields.shape.format,
  shape.fields.shape.precision,
  shape.fields.shape.currency,
  shape.fields.shape.useThousandsSeparator,
  shape.fields.shape.defaultOptionId,
  shape.fields.shape.displayDateFormat,
  shape.fields.shape.displayTimeFormat,
  shape.fields.shape.defaultValueKind,
  shape.fields.shape.defaultTimezone,
  shape.fields.shape.multiple,
  shape.fields.shape.accept,
  shape.fields.shape.meta,
  shape.fields.shape.options,
  shape.fields.shape.options.shape.name,
  shape.fields.shape.options.shape.color,
  shape.fields.shape.options.shape.category
] as const satisfies readonly MutationShapeNode[]

const viewLayoutNodes = [
  shape.views,
  shape.views.shape.name,
  shape.views.shape.type,
  shape.views.shape.options,
  shape.views.shape.fields
] as const satisfies readonly MutationShapeNode[]

const viewQueryAspectNodes = [
  [shape.views.shape.search, 'search'],
  [shape.views.shape.filter, 'filter'],
  [shape.views.shape.sort, 'sort'],
  [shape.views.shape.group, 'group'],
  [shape.views.shape.order, 'order']
] as const satisfies readonly (readonly [MutationShapeNode, DataviewQueryAspect])[]

export const dataviewChangeModel = {
  record: {
    entity: nodeIdOf(shape.records),
    title: nodeIdOf(shape.records.shape.title),
    type: nodeIdOf(shape.records.shape.type),
    meta: nodeIdOf(shape.records.shape.meta),
    values: nodeIdOf(shape.records.shape.values)
  },
  field: {
    entity: nodeIdOf(shape.fields),
    schema: nodeIdSetOf(fieldSchemaNodes)
  },
  view: {
    entity: nodeIdOf(shape.views),
    calc: nodeIdOf(shape.views.shape.calc),
    layout: nodeIdSetOf(viewLayoutNodes),
    queryAspectByNodeId: new Map<number, DataviewQueryAspect>(
      viewQueryAspectNodes.map(([node, aspect]) => [nodeIdOf(node), aspect])
    )
  }
} as const
