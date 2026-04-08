import type { NodeDefinition } from '#react/types/node'
import { createNodeRegistry } from '../nodeRegistry'
import { DrawNodeDefinition } from './draw'
import { FrameNodeDefinition } from './frame'
import { ShapeNodeDefinition } from './shape'
import { StickyNodeDefinition, TextNodeDefinition } from './text'

export const DEFAULT_NODE_DEFINITIONS: NodeDefinition[] = [
  FrameNodeDefinition,
  ShapeNodeDefinition,
  DrawNodeDefinition,
  TextNodeDefinition,
  StickyNodeDefinition
]

export const createDefaultNodeRegistry = () => createNodeRegistry(DEFAULT_NODE_DEFINITIONS)
