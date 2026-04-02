export type UiTagTone =
  | 'neutral'
  | 'gray'
  | 'brown'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red'

const tagToneClasses: Record<UiTagTone, string> = {
  neutral: 'ui-tag-tone--neutral',
  gray: 'ui-tag-tone--gray',
  brown: 'ui-tag-tone--brown',
  orange: 'ui-tag-tone--orange',
  yellow: 'ui-tag-tone--yellow',
  green: 'ui-tag-tone--green',
  blue: 'ui-tag-tone--blue',
  purple: 'ui-tag-tone--purple',
  pink: 'ui-tag-tone--pink',
  red: 'ui-tag-tone--red'
}

const isTagTone = (value: string): value is UiTagTone => value in tagToneClasses

const tag = (value?: string) => {
  if (!value || !isTagTone(value)) {
    return tagToneClasses.neutral
  }

  return tagToneClasses[value]
}

const checkbox = (checked: boolean) => checked
  ? 'ui-checkbox-tone--checked'
  : 'ui-checkbox-tone--unchecked'

export const uiTone = {
  tag,
  checkbox
}
