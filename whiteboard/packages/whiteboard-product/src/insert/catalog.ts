import type { ShapeKind } from '@whiteboard/core/node'
import type {
  WhiteboardInsertCatalog,
  WhiteboardInsertGroup,
  WhiteboardInsertPreset,
  WhiteboardMindmapInsertPreset,
  WhiteboardNodeInsertPreset,
  WhiteboardInsertTemplate
} from '@whiteboard/product/insert/types'
import {
  whiteboardInsertPresetDescriptionToken,
  whiteboardInsertPresetLabelToken,
  whiteboardMindmapPresetDescriptionToken,
  whiteboardMindmapPresetLabelToken
} from '@whiteboard/product/i18n/tokens'
import {
  buildWhiteboardMindmapTemplate,
  listWhiteboardMindmapPresets
} from '@whiteboard/product/mindmap/template'
import {
  DEFAULT_STICKY_INSERT_OPTION_KEY,
  STICKY_INSERT_OPTIONS
} from '@whiteboard/product/palette/sticky'
import {
  createWhiteboardFrameTemplate,
  createWhiteboardStickyTemplate,
  createWhiteboardTextTemplate
} from '@whiteboard/product/node/templates'
import {
  WHITEBOARD_SHAPE_SPECS,
  createWhiteboardShapeTemplate,
  isShapeKind
} from '@whiteboard/product/node/shapes'

const firstPresetKey = <T extends {
  key: string
}>(
  items: readonly T[],
  fallback: string
) => items[0]?.key ?? fallback

const createNodePreset = ({
  key,
  group,
  label,
  description,
  template
}: {
  key: string
  group: WhiteboardInsertGroup
  label: string
  description?: string
  template: WhiteboardInsertTemplate & {
    kind: 'node'
  }
}): WhiteboardNodeInsertPreset => ({
  kind: 'node',
  key,
  group,
  label,
  labelToken: whiteboardInsertPresetLabelToken(key, label),
  description,
  descriptionToken: description
    ? whiteboardInsertPresetDescriptionToken(key, description)
    : undefined,
  template
})

export const WHITEBOARD_MINDMAP_INSERT_PRESETS: readonly WhiteboardMindmapInsertPreset[] =
  listWhiteboardMindmapPresets().map((preset) => ({
    kind: 'mindmap',
    key: preset.key,
    group: 'mindmap',
    label: preset.label,
    labelToken: preset.labelToken ?? whiteboardMindmapPresetLabelToken(preset.key, preset.label),
    description: preset.description,
    descriptionToken: preset.description
      ? (preset.descriptionToken ?? whiteboardMindmapPresetDescriptionToken(preset.key, preset.description))
      : undefined,
    template: {
      kind: 'mindmap',
      template: buildWhiteboardMindmapTemplate({
        preset: preset.key
      }),
      focus: 'edit-root'
    }
  }))

export const WHITEBOARD_TEXT_INSERT_PRESET = createNodePreset({
  key: 'text',
  group: 'text',
  label: 'Text',
  description: 'Empty text block',
  template: {
    kind: 'node',
    template: createWhiteboardTextTemplate(),
    editField: 'text',
    placement: 'point'
  }
})

export const WHITEBOARD_FRAME_INSERT_PRESET = createNodePreset({
  key: 'frame',
  group: 'frame',
  label: 'Frame',
  description: 'Manual frame area',
  template: {
    kind: 'node',
    template: createWhiteboardFrameTemplate(),
    editField: 'title',
    placement: 'center'
  }
})

export const WHITEBOARD_STICKY_INSERT_PRESETS: readonly WhiteboardNodeInsertPreset[] =
  STICKY_INSERT_OPTIONS.map((option) =>
    createNodePreset({
      key: option.key,
      group: 'sticky',
      label: option.label,
      template: {
        kind: 'node',
        template: createWhiteboardStickyTemplate({
          fill: option.tone.fillKey,
          size: {
            width: option.format.width,
            height: option.format.height
          }
        }),
        editField: 'text',
        placement: 'center'
      }
    })
  )

export const WHITEBOARD_SHAPE_INSERT_PRESETS: readonly WhiteboardNodeInsertPreset[] =
  WHITEBOARD_SHAPE_SPECS.map((spec) =>
    createNodePreset({
      key: `shape.${spec.kind}`,
      group: 'shape',
      label: spec.label,
      template: {
        kind: 'node',
        template: createWhiteboardShapeTemplate(spec.kind),
        editField: 'text',
        placement: 'center'
      }
    })
  )

export const WHITEBOARD_INSERT_PRESETS: readonly WhiteboardInsertPreset[] = [
  WHITEBOARD_TEXT_INSERT_PRESET,
  WHITEBOARD_FRAME_INSERT_PRESET,
  ...WHITEBOARD_STICKY_INSERT_PRESETS,
  ...WHITEBOARD_SHAPE_INSERT_PRESETS,
  ...WHITEBOARD_MINDMAP_INSERT_PRESETS
] as const

const INSERT_PRESET_INDEX = new Map(
  WHITEBOARD_INSERT_PRESETS.map((preset) => [preset.key, preset] as const)
)

export const DEFAULT_WHITEBOARD_STICKY_PRESET = firstPresetKey(
  WHITEBOARD_STICKY_INSERT_PRESETS,
  DEFAULT_STICKY_INSERT_OPTION_KEY
)

export const DEFAULT_WHITEBOARD_SHAPE_PRESET = firstPresetKey(
  WHITEBOARD_SHAPE_INSERT_PRESETS,
  'shape.rect'
)

export const DEFAULT_WHITEBOARD_MINDMAP_PRESET = firstPresetKey(
  WHITEBOARD_MINDMAP_INSERT_PRESETS,
  'mindmap.capsule-outline'
)

export const readWhiteboardShapePresetKind = (
  key: string | undefined
): ShapeKind | undefined => {
  if (!key?.startsWith('shape.')) {
    return undefined
  }

  const kind = key.slice('shape.'.length)
  return isShapeKind(kind) ? kind : undefined
}

const CREATE_PRESET_KEY_SET = new Set<string>([
  WHITEBOARD_TEXT_INSERT_PRESET.key,
  WHITEBOARD_FRAME_INSERT_PRESET.key,
  DEFAULT_WHITEBOARD_STICKY_PRESET,
  ...WHITEBOARD_SHAPE_INSERT_PRESETS.map((preset) => preset.key)
])

export const WHITEBOARD_CREATE_PRESETS: readonly WhiteboardInsertPreset[] =
  WHITEBOARD_INSERT_PRESETS.filter((preset) => CREATE_PRESET_KEY_SET.has(preset.key))

export const getWhiteboardInsertPreset = (
  key: string
) => INSERT_PRESET_INDEX.get(key)

export const readWhiteboardInsertGroup = (
  key: string | undefined
) => key
  ? INSERT_PRESET_INDEX.get(key)?.group
  : undefined

export const WHITEBOARD_INSERT_CATALOG: WhiteboardInsertCatalog = {
  get: getWhiteboardInsertPreset,
  defaults: {
    text: WHITEBOARD_TEXT_INSERT_PRESET.key,
    frame: WHITEBOARD_FRAME_INSERT_PRESET.key,
    sticky: DEFAULT_WHITEBOARD_STICKY_PRESET,
    mindmap: DEFAULT_WHITEBOARD_MINDMAP_PRESET,
    shape: (kind) => `shape.${kind}`
  }
}
