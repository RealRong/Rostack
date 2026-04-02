import type { NodeDefinition } from '../../../../types/node'
import { createNodeRegistry } from '../nodeRegistry'
import { DrawNodeDefinition } from './draw'
import { FrameNodeDefinition } from './frame'
import { GroupNodeDefinition } from './group'
import { ShapeNodeDefinition } from './shape'
import { StickyNodeDefinition, TextNodeDefinition } from './text'

export const DEFAULT_NODE_DEFINITIONS: NodeDefinition[] = [
  FrameNodeDefinition,
  ShapeNodeDefinition,
  DrawNodeDefinition,
  TextNodeDefinition,
  StickyNodeDefinition,
  GroupNodeDefinition
]

export const createDefaultNodeRegistry = () => createNodeRegistry(DEFAULT_NODE_DEFINITIONS)
