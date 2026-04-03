import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useGalleryContext } from '../context'
import { Card } from './Card'
import { Overlay } from './Overlay'

const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

export const Grid = () => {
  const controller = useGalleryContext()
  const {
    currentView,
    containerRef,
    cardMinWidth,
    indicator,
    marquee,
    reorderDisabledMessage
  } = controller
  const grouped = Boolean(currentView.view.query.group)
  const appearanceIds = currentView.appearances.ids

  return (
    <div className="flex flex-col gap-6">
      {reorderDisabledMessage ? (
        <div style={contentInsetStyle}>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {reorderDisabledMessage}
          </div>
        </div>
      ) : null}

      <div
        ref={containerRef}
        onPointerDown={marquee.onPointerDown}
        className="relative"
        style={contentInsetStyle}
      >
        {marquee.box ? (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-primary/60 bg-primary/10"
            style={{
              left: marquee.box.left,
              top: marquee.box.top,
              width: marquee.box.width,
              height: marquee.box.height
            }}
          />
        ) : null}
        {indicator ? (
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: indicator.left,
              top: Math.max(0, indicator.top - 4),
              height: indicator.height + 8
            }}
          >
            <div className="absolute left-0 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary shadow-sm" />
            <div className="absolute bottom-0 left-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-primary shadow-sm" />
            <div className="absolute bottom-1 left-0 top-1 w-0.5 -translate-x-1/2 rounded-full bg-primary" />
          </div>
        ) : null}

        {appearanceIds.length || currentView.sections.length ? (
          <div className="flex flex-col gap-6">
            {(grouped ? currentView.sections : [{
              key: 'all',
              title: '',
              color: undefined,
              collapsed: false,
              ids: appearanceIds
            }]).map(section => (
              <section
                key={section.key}
                className="flex flex-col gap-3"
              >
                {grouped ? (
                  <header className="flex items-center gap-2">
                    {section.color ? (
                      <span
                        className="inline-flex h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: section.color
                        }}
                      />
                    ) : null}
                    <h3 className="text-sm font-semibold text-foreground">
                      {section.title}
                      <span className="ml-2 text-xs font-medium text-muted-foreground">{section.ids.length}</span>
                    </h3>
                  </header>
                ) : null}
                {section.ids.length ? (
                  <div
                    className="grid gap-4"
                    style={{
                      gridTemplateColumns: `repeat(auto-fill, minmax(${cardMinWidth}px, 1fr))`
                    }}
                  >
                    {section.ids.map(id => (
                      <Card
                        key={id}
                        appearanceId={id}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed bg-card px-6 py-10 text-sm text-muted-foreground">
                    No records in this section.
                  </div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed bg-card px-6 py-14 text-center text-sm text-muted-foreground">
            No records in this gallery view.
          </div>
        )}
      </div>
      <Overlay />
    </div>
  )
}
