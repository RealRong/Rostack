import type { NodeId, Point, SpatialNodeInput } from '@whiteboard/core/types'
import type {
  EditorDocumentWrite,
  EditorInsertResult
} from '../../types/editor'
import type {
  EditorRead,
  EditorSessionWrite
} from '../../types/editor'
import type { EditField } from '../state/edit'
import type {
  InsertPlacement,
  InsertPreset,
  InsertPresetCatalog
} from '../../types/insert'
import { moveMindmapRoot } from './mindmap'

type InsertWriterHost = {
  read: EditorRead
  document: Pick<EditorDocumentWrite, 'node' | 'mindmap'>
  session: Pick<EditorSessionWrite, 'selection' | 'edit'>
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
  field?: EditField
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
  editor: InsertWriterHost
  preset: Extract<InsertPreset, { kind: 'node' }>
  world: Point
  ownerId?: NodeId
}): EditorInsertResult | undefined => {
  const result = editor.document.node.create(
    placeNodeInput({
      world,
      input: {
        ...preset.input(world),
        ownerId
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
  editor: InsertWriterHost
  preset: Extract<InsertPreset, { kind: 'mindmap' }>
  world: Point
}): EditorInsertResult | undefined => {
  const result = editor.document.mindmap.create({
    rootData: preset.template.root
  })
  if (!result.ok) {
    return undefined
  }

  preset.template.children?.forEach((child) => {
    editor.document.mindmap.insert(result.data.mindmapId, {
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

  moveMindmapRoot({
    editor,
    nodeId: result.data.mindmapId,
    position: {
      x: world.x - width / 2,
      y: world.y - height / 2
    },
    threshold: 0
  })

  return toInsertResult({
    nodeId: result.data.mindmapId
  })
}

const runInsertPreset = ({
  editor,
  preset,
  world,
  ownerId
}: {
  editor: InsertWriterHost
  preset: InsertPreset
  world: Point
  ownerId?: NodeId
}) => {
  const result = preset.kind === 'node'
    ? insertNodePreset({
        editor,
        preset,
        world,
        ownerId: preset.canNest === false ? undefined : ownerId
      })
    : insertMindmapPreset({
        editor,
        preset,
        world
      })

  if (!result) {
    return undefined
  }

  editor.session.selection.replace({
    nodeIds: [result.nodeId]
  })
  if (result.edit) {
    editor.session.edit.start(result.edit.nodeId, result.edit.field)
  }

  return result
}

export const createInsertCommands = ({
  writerHost,
  catalog
}: {
  writerHost: InsertWriterHost
  catalog: InsertPresetCatalog
}): import('../../types/editor').EditorCommands['insert'] => {
  const insertPresetByKey = (input: {
    presetKey: string
    options: {
      at: { x: number; y: number }
      ownerId?: string
    }
  }) => {
    const preset = catalog.get(input.presetKey)
    if (!preset) {
      return undefined
    }

    return runInsertPreset({
      editor: writerHost,
      preset,
      world: input.options.at,
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
