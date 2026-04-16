import type { ComponentProps, ComponentType } from 'react'
import type {
  EdgeDash,
  EdgeMarker,
  EdgeStyle,
  EdgeTextMode,
  EdgeType
} from '@whiteboard/core/types'
import {
  readEdgePresetCreate,
  type EdgePresetKey
} from '@whiteboard/editor'
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
  EdgeLineGlyph,
  EdgeMarkerGlyph
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

export type EdgeMarkerOption = {
  key: EdgeMarker | 'none'
  label: string
  value?: EdgeMarker
  glyph: EdgeIcon
}

export type EdgeTextModeOption = {
  value: EdgeTextMode
  label: string
  glyph: EdgeIcon
}

export type EdgePresetOption = {
  key: EdgePresetKey
  label: string
  glyph: EdgeIcon
  create: {
    type: EdgeType
    style?: Partial<EdgeStyle>
    textMode?: EdgeTextMode
  }
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

const NoneStartGlyph: EdgeIcon = (props) => (
  <EdgeMarkerGlyph
    {...props}
    side="start"
  />
)

const NoneEndGlyph: EdgeIcon = (props) => (
  <EdgeMarkerGlyph
    {...props}
    side="end"
  />
)

const createMarkerGlyph = (
  marker: EdgeMarker,
  side: 'start' | 'end'
): EdgeIcon => (
  props
) => (
    <EdgeMarkerGlyph
      {...props}
      marker={marker}
      side={side}
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
  markers: {
    start: [
      {
        key: 'none',
        label: 'None',
        value: undefined,
        glyph: NoneStartGlyph
      },
      {
        key: 'arrow',
        label: 'Arrow',
        value: 'arrow',
        glyph: createMarkerGlyph('arrow', 'start')
      },
      {
        key: 'arrow-fill',
        label: 'Arrow fill',
        value: 'arrow-fill',
        glyph: createMarkerGlyph('arrow-fill', 'start')
      },
      {
        key: 'circle',
        label: 'Circle',
        value: 'circle',
        glyph: createMarkerGlyph('circle', 'start')
      },
      {
        key: 'circle-fill',
        label: 'Circle fill',
        value: 'circle-fill',
        glyph: createMarkerGlyph('circle-fill', 'start')
      },
      {
        key: 'diamond',
        label: 'Diamond',
        value: 'diamond',
        glyph: createMarkerGlyph('diamond', 'start')
      },
      {
        key: 'diamond-fill',
        label: 'Diamond fill',
        value: 'diamond-fill',
        glyph: createMarkerGlyph('diamond-fill', 'start')
      },
      {
        key: 'bar',
        label: 'Bar',
        value: 'bar',
        glyph: createMarkerGlyph('bar', 'start')
      },
      {
        key: 'double-bar',
        label: 'Double bar',
        value: 'double-bar',
        glyph: createMarkerGlyph('double-bar', 'start')
      },
      {
        key: 'circle-arrow',
        label: 'Circle arrow',
        value: 'circle-arrow',
        glyph: createMarkerGlyph('circle-arrow', 'start')
      },
      {
        key: 'circle-bar',
        label: 'Circle bar',
        value: 'circle-bar',
        glyph: createMarkerGlyph('circle-bar', 'start')
      }
    ] as const satisfies readonly EdgeMarkerOption[],
    end: [
      {
        key: 'none',
        label: 'None',
        value: undefined,
        glyph: NoneEndGlyph
      },
      {
        key: 'arrow',
        label: 'Arrow',
        value: 'arrow',
        glyph: createMarkerGlyph('arrow', 'end')
      },
      {
        key: 'arrow-fill',
        label: 'Arrow fill',
        value: 'arrow-fill',
        glyph: createMarkerGlyph('arrow-fill', 'end')
      },
      {
        key: 'circle',
        label: 'Circle',
        value: 'circle',
        glyph: createMarkerGlyph('circle', 'end')
      },
      {
        key: 'circle-fill',
        label: 'Circle fill',
        value: 'circle-fill',
        glyph: createMarkerGlyph('circle-fill', 'end')
      },
      {
        key: 'diamond',
        label: 'Diamond',
        value: 'diamond',
        glyph: createMarkerGlyph('diamond', 'end')
      },
      {
        key: 'diamond-fill',
        label: 'Diamond fill',
        value: 'diamond-fill',
        glyph: createMarkerGlyph('diamond-fill', 'end')
      },
      {
        key: 'bar',
        label: 'Bar',
        value: 'bar',
        glyph: createMarkerGlyph('bar', 'end')
      },
      {
        key: 'double-bar',
        label: 'Double bar',
        value: 'double-bar',
        glyph: createMarkerGlyph('double-bar', 'end')
      },
      {
        key: 'circle-arrow',
        label: 'Circle arrow',
        value: 'circle-arrow',
        glyph: createMarkerGlyph('circle-arrow', 'end')
      },
      {
        key: 'circle-bar',
        label: 'Circle bar',
        value: 'circle-bar',
        glyph: createMarkerGlyph('circle-bar', 'end')
      }
    ] as const satisfies readonly EdgeMarkerOption[]
  },
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
      create: readEdgePresetCreate('edge.line')
    },
    {
      key: 'edge.arrow',
      label: 'Arrow',
      glyph: Arrow,
      create: readEdgePresetCreate('edge.arrow')
    },
    {
      key: 'edge.elbow-arrow',
      label: 'Elbow',
      glyph: ArrowPolyline,
      create: readEdgePresetCreate('edge.elbow-arrow')
    },
    {
      key: 'edge.fillet-arrow',
      label: 'Fillet',
      glyph: ArrowFillet,
      create: readEdgePresetCreate('edge.fillet-arrow')
    },
    {
      key: 'edge.curve-arrow',
      label: 'Curve',
      glyph: ArrowCurve,
      create: readEdgePresetCreate('edge.curve-arrow')
    }
  ] as const satisfies readonly EdgePresetOption[]
} as const
