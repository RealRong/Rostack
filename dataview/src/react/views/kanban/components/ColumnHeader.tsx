import type { CSSProperties } from 'react'
import type { Section } from '@dataview/react/view'

const colorStyle = (color?: string): CSSProperties | undefined => {
  if (!color) {
    return undefined
  }

  return {
    backgroundColor: color
  }
}

export const ColumnHeader = (props: {
  section: Section
}) => {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-2.5 w-2.5 rounded-full bg-accent"
            style={colorStyle(props.section.color)}
          />
          <h3 className="truncate text-sm font-semibold text-foreground">
            {props.section.title}
            <span className="ml-2 text-xs font-semibold text-muted-foreground">{props.section.ids.length}</span>
          </h3>
        </div>
      </div>
      {props.section.collapsed ? (
        <div className="ui-pill rounded-full px-2 py-1 text-[11px] font-medium">
          {props.section.ids.length}
        </div>
      ) : null}
    </header>
  )
}
