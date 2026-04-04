import {
  selectTool,
  type EditorInsertCommands,
  type EditorInsertResult,
  type InsertPlacement,
  type InsertPreset,
  type InsertPresetCatalog,
  type MindmapInsertPreset,
  type NodeInsertPreset,
  type PointerDownInput
} from '@whiteboard/editor'
import type { NodeId, Point, SpatialNodeInput } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '../../types/runtime'

type InsertCommandRegistry = {
  get: () => EditorInsertCommands | null
  set: (commands: EditorInsertCommands) => void
  clear: () => void
}

const createInsertCommandRegistry = (): InsertCommandRegistry => {
  let current: EditorInsertCommands | null = null

  return {
    get: () => current,
    set: (commands) => {
      current = commands
    },
    clear: () => {
      current = null
    }
  }
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
}): EditorInsertResult => ({
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
  world,
  ownerId
}: {
  editor: WhiteboardRuntime
  preset: NodeInsertPreset
  world: Point
  ownerId?: NodeId
}): EditorInsertResult | undefined => {
  const result = editor.commands.node.create(
    placeNodeInput({
      world,
      input: {
        ...preset.input(world),
        ownerId: preset.canNest === false ? undefined : ownerId
      },
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
}): EditorInsertResult | undefined => {
  const result = editor.commands.mindmap.create({
    rootData: preset.template.root
  })
  if (!result.ok) {
    return undefined
  }

  preset.template.children?.forEach((child) => {
    editor.commands.mindmap.insert(result.data.mindmapId, {
      kind: 'child',
      parentId: result.data.rootId,
      payload: child.data,
      options: {
        side: child.side
      }
    })
  })

  const rect = editor.read.index.node.get(result.data.mindmapId)?.rect
  const width = rect?.width ?? 260
  const height = rect?.height ?? 180

  editor.commands.mindmap.moveRoot({
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
  at,
  ownerId
}: {
  editor: WhiteboardRuntime
  preset: InsertPreset
  at: Point
  ownerId?: NodeId
}): EditorInsertResult | undefined => {
  const result = preset.kind === 'node'
    ? insertNodePreset({
        editor,
        preset,
        world: at,
        ownerId
      })
    : insertMindmapPreset({
        editor,
        preset,
        world: at
      })

  if (!result) {
    return undefined
  }

  editor.commands.selection.replace({
    nodeIds: [result.nodeId]
  })
  if (result.edit) {
    editor.commands.edit.start(result.edit.nodeId, result.edit.field)
  }

  return result
}

const createInsertPresetCommands = ({
  editor,
  catalog
}: {
  editor: WhiteboardRuntime
  catalog: InsertPresetCatalog
}): EditorInsertCommands => {
  const insertPresetByKey = (input: {
    presetKey: string
    options: {
      at: Point
      ownerId?: NodeId
    }
  }) => {
    const preset = catalog.get(input.presetKey)
    if (!preset) {
      return undefined
    }

    return runInsertPreset({
      editor,
      preset,
      at: input.options.at,
      ownerId: input.options.ownerId
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
    sticky: ({ toneKey = catalog.defaults.sticky, at, ownerId }) =>
      insertPresetByKey({
        presetKey: toneKey,
        options: { at, ownerId }
      }),
    shape: ({ kind, at, ownerId }) =>
      insertPresetByKey({
        presetKey: catalog.defaults.shape(kind),
        options: { at, ownerId }
      }),
    mindmap: ({ templateKey = catalog.defaults.mindmap, at }) =>
      insertPresetByKey({
        presetKey: templateKey,
        options: { at }
      })
  }
}

export type HostInsertRuntime = {
  get: InsertCommandRegistry['get']
  bind: (editor: WhiteboardRuntime) => void
  clear: () => void
  pointerDown: (
    editor: WhiteboardRuntime,
    input: PointerDownInput
  ) => boolean
}

export const createHostInsertRuntime = ({
  catalog
}: {
  catalog: InsertPresetCatalog
}): HostInsertRuntime => {
  const registry = createInsertCommandRegistry()

  return {
    get: registry.get,
    bind: (editor) => {
      registry.set(
        createInsertPresetCommands({
          editor,
          catalog
        })
      )
    },
    clear: () => {
      registry.clear()
    },
    pointerDown: (editor, input) => {
      const tool = editor.state.tool.get()
      if (
        tool.type !== 'insert'
        || input.pick.kind !== 'background'
        || input.editable
        || input.ignoreInput
        || input.ignoreSelection
      ) {
        return false
      }

      const result = registry.get()?.preset(tool.preset, {
        at: input.world
      })
      if (!result) {
        return false
      }

      editor.commands.tool.set(selectTool())
      return true
    }
  }
}
