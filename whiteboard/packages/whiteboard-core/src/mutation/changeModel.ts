import {
  getCompiledMutationNode,
  type MutationShapeNode,
} from '@shared/mutation'
import {
  whiteboardMutationSchema,
} from './model'

const shape = whiteboardMutationSchema.shape

const nodeIdOf = (
  node: MutationShapeNode
): number => getCompiledMutationNode(whiteboardMutationSchema, node).nodeId

const nodeIdSetOf = (
  nodes: readonly MutationShapeNode[]
): ReadonlySet<number> => new Set(nodes.map(nodeIdOf))

export const whiteboardChangeModel = {
  node: {
    entity: nodeIdOf(shape.nodes),
    geometry: nodeIdSetOf([
      shape.nodes.shape.position,
      shape.nodes.shape.size,
      shape.nodes.shape.rotation,
    ]),
    owner: nodeIdSetOf([
      shape.nodes.shape.groupId,
      shape.nodes.shape.owner,
    ]),
    content: nodeIdSetOf([
      shape.nodes.shape.type,
      shape.nodes.shape.locked,
      shape.nodes.shape.data,
      shape.nodes.shape.style,
    ]),
  },
  edge: {
    entity: nodeIdOf(shape.edges),
    endpoints: nodeIdSetOf([
      shape.edges.shape.source,
      shape.edges.shape.target,
    ]),
    points: nodeIdOf(shape.edges.shape.points),
    style: nodeIdSetOf([
      shape.edges.shape.type,
      shape.edges.shape.locked,
      shape.edges.shape.groupId,
      shape.edges.shape.textMode,
      shape.edges.shape.style,
    ]),
    labels: nodeIdOf(shape.edges.shape.labels),
    data: nodeIdOf(shape.edges.shape.data),
  },
  mindmap: {
    entity: nodeIdOf(shape.mindmaps),
    structure: nodeIdOf(shape.mindmaps.shape.tree),
    layout: nodeIdOf(shape.mindmaps.shape.layout),
  },
  group: {
    entity: nodeIdOf(shape.groups),
    value: nodeIdSetOf([
      shape.groups.shape.locked,
      shape.groups.shape.name,
    ]),
  },
} as const
