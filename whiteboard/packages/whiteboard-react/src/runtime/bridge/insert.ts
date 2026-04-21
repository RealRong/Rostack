import { node as nodeApi } from '@whiteboard/core/node'
import type { NodeId, Point } from '@whiteboard/core/types'
import type {
  WhiteboardInsertCatalog,
  WhiteboardInsertEditField,
  WhiteboardInsertPlacement,
  WhiteboardInsertPreset,
  WhiteboardMindmapInsertPreset,
  WhiteboardNodeInsertPreset
} from '@whiteboard/product/insert/types'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'

type InsertResult = {
  nodeId: NodeId
  edit?: {
    nodeId: NodeId
    field: WhiteboardInsertEditField
  }
}

const applyInsertEffect = ({
  editor,
  result
}: {
  editor: WhiteboardRuntime
  result: InsertResult
}) => {
  editor.actions.tool.select()
  editor.actions.selection.replace({
    nodeIds: [result.nodeId]
  })

  if (result.edit) {
    editor.actions.edit.startNode(result.edit.nodeId, result.edit.field)
  }
}

export type InsertBridge = {
  template: (
    template: WhiteboardInsertPreset['template'],
    options: {
      at: Point
    }
  ) => InsertResult | undefined
  preset: (
    presetKey: string,
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
    kind: Parameters<WhiteboardInsertCatalog['defaults']['shape']>[0]
    at: Point
  }) => InsertResult | undefined
  mindmap: (options: {
    presetKey?: string
    at: Point
  }) => InsertResult | undefined
}

const placeNode = ({
  world,
  template,
  placement = 'center'
}: {
  world: Point
  template: WhiteboardNodeInsertPreset['template']['template']
  placement?: WhiteboardInsertPlacement
}) => {
  const bootstrapSize = nodeApi.bootstrap.resolve(template)
  const width = bootstrapSize?.width ?? 160
  const height = bootstrapSize?.height ?? 80

  return {
    position: placement === 'point'
      ? world
      : {
          x: world.x - width / 2,
          y: world.y - height / 2
        },
    template
  }
}

const toInsertResult = ({
  nodeId,
  field
}: {
  nodeId: NodeId
  field?: WhiteboardInsertEditField
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
  const currentRect = editor.read.node.render.get(nodeId)?.rect
  if (
    currentRect
    && currentRect.x === nextPosition.x
    && currentRect.y === nextPosition.y
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
  preset: WhiteboardNodeInsertPreset
  world: Point
}): InsertResult | undefined => {
  const result = editor.actions.node.create(
    placeNode({
      world,
      template: preset.template.template,
      placement: preset.template.placement
    })
  )
  if (!result.ok) {
    return undefined
  }

  if (preset.template.placement !== 'point') {
    recenterNode({
      editor,
      nodeId: result.data.nodeId,
      center: world
    })
  }

  return toInsertResult({
    nodeId: result.data.nodeId,
    field: preset.template.editField
  })
}

const insertMindmapPreset = ({
  editor,
  preset,
  world
}: {
  editor: WhiteboardRuntime
  preset: WhiteboardMindmapInsertPreset
  world: Point
}): InsertResult | undefined => {
  const result = editor.actions.mindmap.create({
    position: {
      x: 0,
      y: 0
    },
    template: preset.template.template
  }, {
    focus: 'none'
  })
  if (!result.ok) {
    return undefined
  }

  const bbox = editor.read.mindmap.scene.get(result.data.mindmapId)?.bbox
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
    edit: preset.template.focus === 'edit-root' || preset.template.focus === undefined
      ? {
          nodeId: result.data.rootId,
          field: 'text'
        }
      : undefined
  }
}

const runInsertPreset = ({
  editor,
  preset,
  at
}: {
  editor: WhiteboardRuntime
  preset: WhiteboardInsertPreset
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

  applyInsertEffect({
    editor,
    result
  })

  return result
}

export const createInsertBridge = ({
  editor,
  catalog
}: {
  editor: WhiteboardRuntime
  catalog: WhiteboardInsertCatalog
}): InsertBridge => {
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

  const insertByTemplate = (input: {
    template: WhiteboardInsertPreset['template']
    at: Point
  }) => runInsertPreset({
    editor,
    preset: {
      key: '',
      group: input.template.kind === 'mindmap' ? 'mindmap' : 'text',
      label: '',
      kind: input.template.kind,
      template: input.template as never
    } as WhiteboardInsertPreset,
    at: input.at
  })

  return {
    template: (template, options) => insertByTemplate({
      template,
      at: options.at
    }),
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
