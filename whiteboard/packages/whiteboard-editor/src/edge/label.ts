import type { Edge } from '@whiteboard/core/types'
import type { TextMetricsSpec } from '@whiteboard/editor/types/layout'

export const EDGE_LABEL_PLACEHOLDER = 'Label'
export const EDGE_LABEL_DEFAULT_FONT_SIZE = 14
export const EDGE_LABEL_MASK_BLEED = 4

type EdgeLabelStyle = NonNullable<Edge['labels']>[number]['style']

export const readEdgeLabelText = (
  value: string | undefined
) => typeof value === 'string'
  ? value
  : ''

export const readEdgeLabelDisplayText = (
  value: string,
  editing: boolean
) => value || (editing ? EDGE_LABEL_PLACEHOLDER : '')

export const buildEdgeLabelTextMetricsSpec = ({
  text,
  style
}: {
  text: string | undefined
  style: EdgeLabelStyle
}): TextMetricsSpec => ({
  profile: 'edge-label',
  text: readEdgeLabelText(text),
  placeholder: EDGE_LABEL_PLACEHOLDER,
  fontSize: style?.size ?? EDGE_LABEL_DEFAULT_FONT_SIZE,
  fontWeight: style?.weight ?? 400,
  fontStyle: style?.italic
    ? 'italic'
    : 'normal'
})
