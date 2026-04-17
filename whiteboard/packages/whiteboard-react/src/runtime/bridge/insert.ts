import {
  type InsertPresetKey,
  type InsertPlacement,
  type InsertPreset,
  type InsertPresetCatalog,
  type MindmapInsertPreset,
  type NodeInsertPreset
} from '@whiteboard/editor'
import { resolveNodeBootstrapSize } from '@whiteboard/core/node'
import type { NodeId, Point, SpatialNodeInput } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type InsertResult = {
  nodeId: NodeId
  edit?: {
    nodeId: NodeId
    field: NonNullable<NodeInsertPreset['focus']>
  }
}

export type InsertBridge = {
  preset: (
    preset: InsertPresetKey,
    options: {
      at: Point
    }
  ) => InsertResult | undefined
  text: (options: {
    at: Point
  }) => InsertResult | undefined
  frame: (options: {
    at: Point
  }) => InsertResult | undefined
  sticky: (options: {
    presetKey?: string
    at: Point
  }) => InsertResult | undefined
  shape: (options: {
    kind: Parameters<InsertPresetCatalog['defaults']['shape']>[0]
    at: Point
  }) => InsertResult | undefined
  mindmap: (options: {
    presetKey?: string
    at: Point
  }) => InsertResult | undefined
}

const placeNodeInput = ({
  world,
  input,
  placement = 'center'
}: {
  world: Point
  input: Omit<SpatialNodeInput, 'position'>
  placement?: InsertPlacement
}): SpatialNodeInput => {
  const bootstrapSize = resolveNodeBootstrapSize(input)
  const width = bootstrapSize?.width ?? 160
  const height = bootstrapSize?.height ?? 80

  return {
    ...input,
    position: placement === 'point'
      ? world
      : {
          x: world.x - width / 2,
          y: world.y - height / 2
        }
  }
}

const toInsertResult = ({
  nodeId,
  field
}: {
  nodeId: NodeId
  field?: NodeInsertPreset['focus']
}): InsertResult => ({
  nodeId,
  edit: field
    ? {
        nodeId,
        field
      }
    : undefined
})

const recenterNode = ({
  editor,
  nodeId,
  center
}: {
  editor: WhiteboardRuntime
  nodeId: NodeId
  center: Point
}) => {
  const rect = editor.read.node.render.get(nodeId)?.rect
  if (!rect) {
    return
  }

  const nextPosition = {
    x: center.x - rect.width / 2,
    y: center.y - rect.height / 2
  }
  const current = editor.read.node.render.get(nodeId)?.node.position
  if (
    current
    && current.x === nextPosition.x
    && current.y === nextPosition.y
  ) {
    return
  }

  editor.actions.node.patch([nodeId], {
    fields: {
      position: nextPosition
    }
  })
}

const insertNodePreset = ({
  editor,
  preset,
  world
}: {
  editor: WhiteboardRuntime
  preset: NodeInsertPreset
  world: Point
}): InsertResult | undefined => {
  const result = editor.actions.node.create(
    placeNodeInput({
      world,
      input: preset.input(world),
      placement: preset.placement
    })
  )
  if (!result.ok) {
    return undefined
  }

  if (preset.placement !== 'point') {
    recenterNode({
      editor,
      nodeId: result.data.nodeId,
      center: world
    })
  }

  return toInsertResult({
    nodeId: result.data.nodeId,
    field: preset.focus
  })
}

const insertMindmapPreset = ({
  editor,
  preset,
  world
}: {
  editor: WhiteboardRuntime
  preset: MindmapInsertPreset
  world: Point
}): InsertResult | undefined => {
  const result = editor.actions.mindmap.create({
    preset: preset.preset,
    seed: preset.seed
  })
  if (!result.ok) {
    return undefined
  }

  const bbox = editor.read.mindmap.render.get(result.data.mindmapId)?.bbox
  const anchorX = bbox
    ? bbox.x + bbox.width / 2
    : 0
  const anchorY = bbox
    ? bbox.y + bbox.height / 2
    : 0

  editor.actions.mindmap.moveRoot({
    nodeId: result.data.mindmapId,
    position: {
      x: world.x - anchorX,
      y: world.y - anchorY
    },
    threshold: 0
  })

  return {
    nodeId: result.data.rootId,
    edit: {
      nodeId: result.data.rootId,
      field: 'text'
    }
  }
}

const runInsertPreset = ({
  editor,
  preset,
  at
}: {
  editor: WhiteboardRuntime
  preset: InsertPreset
  at: Point
}): InsertResult | undefined => {
  const result = preset.kind === 'node'
    ? insertNodePreset({
      editor,
      preset,
      world: at
    })
    : insertMindmapPreset({
        editor,
        preset,
        world: at
      })

  if (!result) {
    return undefined
  }

  editor.actions.selection.replace({
    nodeIds: [result.nodeId]
  })
  const edit = result.edit
  if (edit) {
    editor.actions.edit.startNode(edit.nodeId, edit.field)
  }

  return result
}

const createInsertCommands = ({
  editor,
  catalog
}: {
  editor: WhiteboardRuntime
  catalog: InsertPresetCatalog
}): Omit<InsertBridge, 'pointerDown'> => {
  const insertPresetByKey = (input: {
    presetKey: string
    options: {
      at: Point
    }
  }) => {
    const preset = catalog.get(input.presetKey)
    if (!preset) {
      return undefined
    }

    return runInsertPreset({
      editor,
      preset,
      at: input.options.at
    })
  }

  return {
    preset: (presetKey, options) => insertPresetByKey({
      presetKey,
      options
    }),
    text: (options) => insertPresetByKey({
      presetKey: catalog.defaults.text,
      options
    }),
    frame: (options) => insertPresetByKey({
      presetKey: catalog.defaults.frame,
      options
    }),
    sticky: ({ presetKey = catalog.defaults.sticky, at }) =>
      insertPresetByKey({
        presetKey,
        options: { at }
      }),
    shape: ({ kind, at }) =>
      insertPresetByKey({
        presetKey: catalog.defaults.shape(kind),
        options: { at }
      }),
    mindmap: ({ presetKey = catalog.defaults.mindmap, at }) =>
      insertPresetByKey({
        presetKey,
        options: { at }
      })
  }
}

export const createInsertBridge = ({
  editor,
  catalog
}: {
  editor: WhiteboardRuntime
  catalog: InsertPresetCatalog
}): InsertBridge => {
  return createInsertCommands({
    editor,
    catalog
  })
}
