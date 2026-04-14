import {
  type InsertPresetKey,
  type InsertPlacement,
  type InsertPreset,
  type InsertPresetCatalog,
  type MindmapInsertPreset,
  type NodeInsertPreset
} from '@whiteboard/editor'
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
    toneKey?: string
    at: Point
  }) => InsertResult | undefined
  shape: (options: {
    kind: Parameters<InsertPresetCatalog['defaults']['shape']>[0]
    at: Point
  }) => InsertResult | undefined
  mindmap: (options: {
    templateKey?: string
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
  const width = input.size?.width ?? 160
  const height = input.size?.height ?? 80

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
    rootData: preset.template.root
  })
  if (!result.ok) {
    return undefined
  }

  preset.template.children?.forEach((child) => {
    editor.actions.mindmap.insert(result.data.mindmapId, {
      kind: 'child',
      parentId: result.data.rootId,
      payload: child.data,
      options: {
        side: child.side
      }
    })
  })

  const rect = editor.read.node.item.get(result.data.mindmapId)?.rect
  const width = rect?.width ?? 260
  const height = rect?.height ?? 180

  editor.actions.mindmap.moveRoot({
    nodeId: result.data.mindmapId,
    position: {
      x: world.x - width / 2,
      y: world.y - height / 2
    },
    threshold: 0
  })

  return {
    nodeId: result.data.mindmapId
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
    sticky: ({ toneKey = catalog.defaults.sticky, at }) =>
      insertPresetByKey({
        presetKey: toneKey,
        options: { at }
      }),
    shape: ({ kind, at }) =>
      insertPresetByKey({
        presetKey: catalog.defaults.shape(kind),
        options: { at }
      }),
    mindmap: ({ templateKey = catalog.defaults.mindmap, at }) =>
      insertPresetByKey({
        presetKey: templateKey,
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
