import type { ComponentProps, ComponentType } from 'react'
import type {
  EdgeDash,
  EdgeTemplate,
  EdgeStyle,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import { WHITEBOARD_EDGE_PRESETS } from '@whiteboard/product'
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

export const EDGE_UI = {
  palette: {
    group: 'line',
    columns: 10
  },
  types: [
    {
      value: 'straight',
      label: 'Straight',
      glyph: StraightGlyph
    },
    {
      value: 'elbow',
      label: 'Elbow',
      glyph: ElbowGlyph
    },
    {
      value: 'fillet',
      label: 'Fillet',
      glyph: FilletGlyph
    },
    {
      value: 'curve',
      label: 'Curve',
      glyph: CurveGlyph
    }
  ] as const satisfies readonly EdgeTypeOption[],
  dashes: [
    {
      value: 'solid',
      label: 'Solid',
      glyph: SolidGlyph
    },
    {
      value: 'dashed',
      label: 'Dashed',
      glyph: DashedGlyph
    },
    {
      value: 'dotted',
      label: 'Dotted',
      glyph: DottedGlyph
    }
  ] as const satisfies readonly EdgeDashOption[],
  widths: [1, 2, 3, 4, 6, 8, 12, 16] as const,
  textModes: [
    {
      value: 'horizontal',
      label: 'Horizontal',
      glyph: Horizontal
    },
    {
      value: 'tangent',
      label: 'Tangent',
      glyph: Tangent
    }
  ] as const satisfies readonly EdgeTextModeOption[],
  presets: [
    {
      key: 'edge.line',
      label: 'Line',
      glyph: ArrowLine,
      template: WHITEBOARD_EDGE_PRESETS.find((entry) => entry.key === 'edge.line')!.template
    },
    {
      key: 'edge.arrow',
      label: 'Arrow',
      glyph: Arrow,
      template: WHITEBOARD_EDGE_PRESETS.find((entry) => entry.key === 'edge.arrow')!.template
    },
    {
      key: 'edge.elbow-arrow',
      label: 'Elbow',
      glyph: ArrowPolyline,
      template: WHITEBOARD_EDGE_PRESETS.find((entry) => entry.key === 'edge.elbow-arrow')!.template
    },
    {
      key: 'edge.fillet-arrow',
      label: 'Fillet',
      glyph: ArrowFillet,
      template: WHITEBOARD_EDGE_PRESETS.find((entry) => entry.key === 'edge.fillet-arrow')!.template
    },
    {
      key: 'edge.curve-arrow',
      label: 'Curve',
      glyph: ArrowCurve,
      template: WHITEBOARD_EDGE_PRESETS.find((entry) => entry.key === 'edge.curve-arrow')!.template
    }
  ] as const satisfies readonly EdgePresetOption[]
} as const
