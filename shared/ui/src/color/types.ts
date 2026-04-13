import familyData from '#shared-ui/color/families.json'

export type UiOptionColorId =
  | 'default'
  | 'gray'
  | 'brown'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'green'
  | 'blue'
  | 'teal'
  | 'purple'
  | 'pink'

export type UiOptionColorFamily = {
  id: UiOptionColorId
  label: string
  content: boolean
}

export const UI_OPTION_COLOR_FAMILIES = familyData as readonly UiOptionColorFamily[]

export const UI_OPTION_COLOR_IDS = UI_OPTION_COLOR_FAMILIES.map(
  (family) => family.id
) as readonly UiOptionColorId[]

export const UI_CONTENT_COLOR_FAMILIES = UI_OPTION_COLOR_FAMILIES.filter(
  (family) => family.content
) as readonly UiOptionColorFamily[]

export const UI_CONTENT_COLOR_IDS = UI_CONTENT_COLOR_FAMILIES.map(
  (family) => family.id
) as readonly Exclude<UiOptionColorId, 'default'>[]

export type UiOptionColorTokenUsage =
  | 'badge-bg'
  | 'badge-text'
  | 'badge-border'
  | 'column-bg'
  | 'column-border'
  | 'bg-card'
  | 'card-border'
  | 'bg-card-hover'
  | 'bg-card-pressed'
  | 'dot-bg'
  | 'status-dot'
  | 'surface'
  | 'surface-hover'
  | 'surface-pressed'
  | 'text'
  | 'text-secondary'
  | 'text-muted'
  | 'icon-secondary'

export type UiCardSurfaceState =
  | 'default'
  | 'hover'
  | 'pressed'

export type UiNeutralCardSurfaceTone =
  | 'solid'
  | 'preview'
