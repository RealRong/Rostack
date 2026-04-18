import type { ComponentProps, ComponentType } from 'react'
import type {
  EdgeDash,
  EdgeTemplate,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import {
  WHITEBOARD_EDGE_PRESETS,
  WHITEBOARD_EDGE_UI
} from '@whiteboard/product'
import { Horizontal } from '@whiteboard/react/icons/Horizontal'
import { Tangent } from '@whiteboard/react/icons/Tangent'
import {
  Arrow,
  ArrowCurve,
  ArrowFillet,
  ArrowLine,
  ArrowPolyline
} from '@whiteboard/react/icons/menu-line-types'
import {
  EdgeLineGlyph
} from '@whiteboard/react/features/edge/ui/glyphs'

type EdgeIconProps = Omit<ComponentProps<'svg'>, 'opacity'>
type EdgeIcon = ComponentType<EdgeIconProps>

export type EdgeTypeOption = {
  value: EdgeType
  label: string
  glyph: EdgeIcon
}

export type EdgeDashOption = {
  value: EdgeDash
  label: string
  glyph: EdgeIcon
}

export type EdgeTextModeOption = {
  value: EdgeTextMode
  label: string
  glyph: EdgeIcon
}

export type EdgePresetOption = {
  key: string
  label: string
  glyph: EdgeIcon
  template: EdgeTemplate
}

const StraightGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    type="straight"
  />
)

const ElbowGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    type="elbow"
  />
)

const FilletGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    type="fillet"
  />
)

const CurveGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    type="curve"
  />
)

const SolidGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    dash="solid"
  />
)

const DashedGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    dash="dashed"
  />
)

const DottedGlyph: EdgeIcon = (props) => (
  <EdgeLineGlyph
    {...props}
    dash="dotted"
  />
)

const EDGE_TYPE_GLYPHS = {
  straight: StraightGlyph,
  elbow: ElbowGlyph,
  fillet: FilletGlyph,
  curve: CurveGlyph
} as const satisfies Partial<Record<EdgeType, EdgeIcon>>

const EDGE_DASH_GLYPHS = {
  solid: SolidGlyph,
  dashed: DashedGlyph,
  dotted: DottedGlyph
} as const satisfies Record<EdgeDash, EdgeIcon>

const EDGE_TEXT_MODE_GLYPHS = {
  horizontal: Horizontal,
  tangent: Tangent
} as const satisfies Record<EdgeTextMode, EdgeIcon>

const EDGE_PRESET_GLYPHS = {
  'edge.line': ArrowLine,
  'edge.arrow': Arrow,
  'edge.elbow-arrow': ArrowPolyline,
  'edge.fillet-arrow': ArrowFillet,
  'edge.curve-arrow': ArrowCurve
} as Record<string, EdgeIcon>

export const EDGE_UI = {
  palette: WHITEBOARD_EDGE_UI.palette,
  types: WHITEBOARD_EDGE_UI.types.map((option) => ({
    ...option,
    glyph: EDGE_TYPE_GLYPHS[option.value]
  })) as readonly EdgeTypeOption[],
  dashes: WHITEBOARD_EDGE_UI.dashes.map((option) => ({
    ...option,
    glyph: EDGE_DASH_GLYPHS[option.value]
  })) as readonly EdgeDashOption[],
  widths: WHITEBOARD_EDGE_UI.widths,
  textModes: WHITEBOARD_EDGE_UI.textModes.map((option) => ({
    ...option,
    glyph: EDGE_TEXT_MODE_GLYPHS[option.value]
  })) as readonly EdgeTextModeOption[],
  presets: WHITEBOARD_EDGE_UI.presets.map((option) => ({
    ...option,
    glyph: EDGE_PRESET_GLYPHS[option.key],
    template: WHITEBOARD_EDGE_PRESETS.find((entry) => entry.key === option.key)!.template
  })) as readonly EdgePresetOption[]
} as const
