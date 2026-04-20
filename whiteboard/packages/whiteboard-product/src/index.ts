import {
  readWhiteboardDrawView,
  WHITEBOARD_DRAW_DEFAULTS,
  WHITEBOARD_DRAW_DEFAULT_MODE,
  WHITEBOARD_DRAW_MODES,
  WHITEBOARD_DRAW_SLOTS,
  WHITEBOARD_DRAW_WIDTH_RANGE
} from '@whiteboard/product/draw'
import * as edgeMarkers from '@whiteboard/product/edge/markers'
import * as edgePresets from '@whiteboard/product/edge/presets'
import { WHITEBOARD_EDGE_UI } from '@whiteboard/product/edge/ui'
import * as i18nKeys from '@whiteboard/product/i18n/keys'
import {
  whiteboardProductEnResources as i18nEn
} from '@whiteboard/product/i18n/resources/en'
import {
  whiteboardProductZhCNResources as i18nZhCN
} from '@whiteboard/product/i18n/resources/zh-CN'
import { registerWhiteboardProductI18n } from '@whiteboard/product/i18n/register'
import * as i18nTokens from '@whiteboard/product/i18n/tokens'
import * as insertCatalog from '@whiteboard/product/insert/catalog'
import * as insertTypes from '@whiteboard/product/insert/types'
import { WHITEBOARD_MINDMAP_UI } from '@whiteboard/product/mindmap/ui'
import * as mindmapTemplate from '@whiteboard/product/mindmap/template'
import * as nodeDefaults from '@whiteboard/product/node/defaults'
import * as nodeShapes from '@whiteboard/product/node/shapes'
import * as nodeTemplates from '@whiteboard/product/node/templates'
import * as nodeText from '@whiteboard/product/node/text'
import * as paletteDefaults from '@whiteboard/product/palette/defaults'
import * as paletteKey from '@whiteboard/product/palette/key'
import * as paletteRegistry from '@whiteboard/product/palette/registry'
import * as paletteSticky from '@whiteboard/product/palette/sticky'
import * as paletteUi from '@whiteboard/product/palette/ui'
import { WHITEBOARD_STROKE_STYLE_OPTIONS } from '@whiteboard/product/stroke/options'

export const product = {
  palette: {
    key: {
      create: paletteKey.createWhiteboardPaletteKey,
      parse: paletteKey.parseWhiteboardPaletteKey,
      is: paletteKey.isWhiteboardPaletteKey,
      resolveValue: paletteKey.resolveWhiteboardPaletteValue,
      resolveVariable: paletteKey.resolveWhiteboardPaletteVariable
    },
    registry: {
      byGroup: paletteRegistry.WHITEBOARD_PALETTE_REGISTRY,
      keys: paletteRegistry.WHITEBOARD_PALETTE_KEYS,
      bg: paletteRegistry.WHITEBOARD_BG_PALETTE_INDICES,
      sticky: paletteRegistry.WHITEBOARD_STICKY_PALETTE_INDICES,
      border: paletteRegistry.WHITEBOARD_BORDER_PALETTE_INDICES,
      text: paletteRegistry.WHITEBOARD_TEXT_PALETTE_INDICES,
      line: paletteRegistry.WHITEBOARD_LINE_PALETTE_INDICES
    },
    defaults: {
      textColor: paletteDefaults.WHITEBOARD_TEXT_DEFAULT_COLOR,
      strokeColor: paletteDefaults.WHITEBOARD_STROKE_DEFAULT_COLOR,
      lineColor: paletteDefaults.WHITEBOARD_LINE_DEFAULT_COLOR,
      surfaceFill: paletteDefaults.WHITEBOARD_SURFACE_DEFAULT_FILL,
      sticky: paletteDefaults.WHITEBOARD_STICKY_DEFAULTS,
      frame: paletteDefaults.WHITEBOARD_FRAME_DEFAULTS,
      shape: paletteDefaults.WHITEBOARD_SHAPE_DEFAULTS,
      shapePresetPaints: paletteDefaults.WHITEBOARD_SHAPE_PRESET_PAINTS,
      stickyTonePresets: paletteDefaults.WHITEBOARD_STICKY_TONE_PRESETS
    },
    sticky: paletteSticky,
    ui: paletteUi
  },
  draw: {
    modes: WHITEBOARD_DRAW_MODES,
    slots: WHITEBOARD_DRAW_SLOTS,
    defaultMode: WHITEBOARD_DRAW_DEFAULT_MODE,
    defaults: WHITEBOARD_DRAW_DEFAULTS,
    widthRange: WHITEBOARD_DRAW_WIDTH_RANGE,
    view: readWhiteboardDrawView
  },
  stroke: {
    options: WHITEBOARD_STROKE_STYLE_OPTIONS
  },
  edge: {
    markers: edgeMarkers,
    presets: edgePresets,
    ui: WHITEBOARD_EDGE_UI
  },
  insert: {
    types: insertTypes,
    catalog: insertCatalog
  },
  node: {
    defaults: nodeDefaults,
    text: nodeText,
    templates: nodeTemplates,
    shapes: nodeShapes
  },
  mindmap: {
    ui: WHITEBOARD_MINDMAP_UI,
    template: {
      ...mindmapTemplate,
      build: mindmapTemplate.buildWhiteboardMindmapTemplate
    }
  },
  i18n: {
    keys: i18nKeys,
    tokens: i18nTokens,
    resources: {
      en: i18nEn,
      zhCN: i18nZhCN
    },
    register: registerWhiteboardProductI18n
  }
} as const

export type * from '@whiteboard/product/draw'
export type * from '@whiteboard/product/edge/ui'
export type * from '@whiteboard/product/insert/types'
export type * from '@whiteboard/product/palette/defaults'
export type * from '@whiteboard/product/palette/key'
export type * from '@whiteboard/product/palette/registry'
export type * from '@whiteboard/product/palette/sticky'
export type * from '@whiteboard/product/palette/ui'
export type * from '@whiteboard/product/stroke/options'
