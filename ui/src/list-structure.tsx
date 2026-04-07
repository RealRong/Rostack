import type { ReactNode } from 'react'

export interface ListDividerItem {
  kind: 'divider'
  key: string
}

export interface ListLabelItem {
  kind: 'label'
  key: string
  label: ReactNode
}

export interface ListCustomItem {
  kind: 'custom'
  key: string
  node?: ReactNode
  render?: () => ReactNode
}

export type ListStructuralItem =
  | ListDividerItem
  | ListLabelItem
  | ListCustomItem

export const isListStructuralItem = (
  item: {
    kind: string
  }
): item is ListStructuralItem => (
  item.kind === 'divider'
  || item.kind === 'label'
  || item.kind === 'custom'
)

export const renderListStructuralItem = (
  item: ListStructuralItem,
  onMouseEnter?: () => void
) => {
  switch (item.kind) {
    case 'divider':
      return (
        <div
          key={item.key}
          className="my-1 border-t border-divider"
          onMouseEnter={onMouseEnter}
        />
      )
    case 'label':
      return (
        <div
          key={item.key}
          className="px-1.5 pb-1 pt-1 text-[11px] font-medium text-muted-foreground"
          onMouseEnter={onMouseEnter}
        >
          {item.label}
        </div>
      )
    case 'custom':
      return (
        <div
          key={item.key}
          onMouseEnter={onMouseEnter}
        >
          {item.node ?? item.render?.() ?? null}
        </div>
      )
    default:
      return null
  }
}
