import type { NodeDefinition } from '@whiteboard/react/types/node'
import { createNodeRegistry } from '@whiteboard/react/features/node/registry/nodeRegistry'
import { DrawNodeDefinition } from '@whiteboard/react/features/node/registry/default/draw'
import { FrameNodeDefinition } from '@whiteboard/react/features/node/registry/default/frame'
import { ShapeNodeDefinition } from '@whiteboard/react/features/node/registry/default/shape'
import { StickyNodeDefinition, TextNodeDefinition } from '@whiteboard/react/features/node/registry/default/text'

export const DEFAULT_NODE_DEFINITIONS: NodeDefinition[] = [
  FrameNodeDefinition,
  ShapeNodeDefinition,
  DrawNodeDefinition,
  TextNodeDefinition,
  StickyNodeDefinition
]

export const createDefaultNodeRegistry = () => createNodeRegistry(DEFAULT_NODE_DEFINITIONS)
