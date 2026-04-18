import { registerTokenResolver } from '@shared/i18n'
import {
  getWhiteboardEdgePreset
} from '@whiteboard/product/edge/presets'
import {
  getWhiteboardInsertPreset
} from '@whiteboard/product/insert/catalog'
import {
  getWhiteboardMindmapPreset,
  getWhiteboardMindmapSeed
} from '@whiteboard/product/mindmap/template'

let registered = false

export const registerWhiteboardProductI18n = () => {
  if (registered) {
    return
  }

  registered = true

  registerTokenResolver('whiteboard.edgePreset.label', (value) => {
    const preset = value.id ? getWhiteboardEdgePreset(value.id) : undefined
    return preset?.labelToken
  })

  registerTokenResolver('whiteboard.insertPreset.label', (value) => {
    const preset = value.id ? getWhiteboardInsertPreset(value.id) : undefined
    return preset?.labelToken
  })

  registerTokenResolver('whiteboard.insertPreset.description', (value) => {
    const preset = value.id ? getWhiteboardInsertPreset(value.id) : undefined
    return preset?.descriptionToken
  })

  registerTokenResolver('whiteboard.mindmap.seed.label', (value) => {
    const seed = value.id ? getWhiteboardMindmapSeed(value.id) : undefined
    return seed?.labelToken
  })

  registerTokenResolver('whiteboard.mindmap.seed.description', (value) => {
    const seed = value.id ? getWhiteboardMindmapSeed(value.id) : undefined
    return seed?.descriptionToken
  })

  registerTokenResolver('whiteboard.mindmap.preset.label', (value) => {
    const preset = value.id ? getWhiteboardMindmapPreset(value.id) : undefined
    return preset?.labelToken
  })

  registerTokenResolver('whiteboard.mindmap.preset.description', (value) => {
    const preset = value.id ? getWhiteboardMindmapPreset(value.id) : undefined
    return preset?.descriptionToken
  })
}
