export type WhiteboardStrokeStyleOption = {
  key: 'solid' | 'dashed' | 'dotted'
  label: string
  dash?: readonly number[]
}

export const WHITEBOARD_STROKE_STYLE_OPTIONS = [
  {
    key: 'solid',
    label: 'Solid',
    dash: undefined
  },
  {
    key: 'dashed',
    label: 'Dashed',
    dash: [8, 6] as const
  },
  {
    key: 'dotted',
    label: 'Dotted',
    dash: [2, 4] as const
  }
] as const satisfies readonly WhiteboardStrokeStyleOption[]
