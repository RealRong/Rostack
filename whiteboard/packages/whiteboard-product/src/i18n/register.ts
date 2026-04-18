import { registerTokenResolver } from '@shared/i18n'
import {
  getWhiteboardEdgePreset
} from '@whiteboard/product/edge/presets'
import {
  getWhiteboardInsertPreset
} from '@whiteboard/product/insert/catalog'
import {
  getWhiteboardMindmapPreset
} from '@whiteboard/product/mindmap/presets'
import {
  getWhiteboardMindmapSeed
} from '@whiteboard/product/mindmap/seeds'
import {
  whiteboardEdgePresetLabelToken,
  whiteboardInsertPresetDescriptionToken,
  whiteboardInsertPresetLabelToken,
  whiteboardMindmapPresetDescriptionToken,
  whiteboardMindmapPresetLabelToken,
  whiteboardMindmapSeedDescriptionToken,
  whiteboardMindmapSeedLabelToken
} from '@whiteboard/product/i18n/tokens'

let registered = false

export const registerWhiteboardProductI18n = () => {
  if (registered) {
    return
  }

  registered = true

  registerTokenResolver('whiteboard.edgePreset.label', (value) => {
    const preset = value.id ? getWhiteboardEdgePreset(value.id) : undefined
    return preset
      ? whiteboardEdgePresetLabelToken(preset.key, preset.label)
      : undefined
  })

  registerTokenResolver('whiteboard.insertPreset.label', (value) => {
    const preset = value.id ? getWhiteboardInsertPreset(value.id) : undefined
    return preset
      ? whiteboardInsertPresetLabelToken(preset.key, preset.label)
      : undefined
  })

  registerTokenResolver('whiteboard.insertPreset.description', (value) => {
    const preset = value.id ? getWhiteboardInsertPreset(value.id) : undefined
    return preset?.description
      ? whiteboardInsertPresetDescriptionToken(preset.key, preset.description)
      : undefined
  })

  registerTokenResolver('whiteboard.mindmap.seed.label', (value) => {
    const seed = value.id ? getWhiteboardMindmapSeed(value.id) : undefined
    return seed
      ? whiteboardMindmapSeedLabelToken(seed.key, seed.label)
      : undefined
  })

  registerTokenResolver('whiteboard.mindmap.seed.description', (value) => {
    const seed = value.id ? getWhiteboardMindmapSeed(value.id) : undefined
    return seed?.description
      ? whiteboardMindmapSeedDescriptionToken(seed.key, seed.description)
      : undefined
  })

  registerTokenResolver('whiteboard.mindmap.preset.label', (value) => {
    const preset = value.id ? getWhiteboardMindmapPreset(value.id) : undefined
    return preset
      ? whiteboardMindmapPresetLabelToken(preset.key, preset.label)
      : undefined
  })

  registerTokenResolver('whiteboard.mindmap.preset.description', (value) => {
    const preset = value.id ? getWhiteboardMindmapPreset(value.id) : undefined
    return preset?.description
      ? whiteboardMindmapPresetDescriptionToken(preset.key, preset.description)
      : undefined
  })
}
