import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import {
  useDataView
} from '@dataview/react/dataview'
import { resolveOptionDotStyle } from '@shared/ui/color'
import { token } from '@shared/i18n'
import { useTranslation } from '@shared/i18n/react'
import { useGalleryContext } from '@dataview/react/views/gallery/context'
import { GALLERY_CARD_GAP } from '@dataview/react/views/gallery/virtual'
import { Card } from '@dataview/react/views/gallery/components/Card'
import { Overlay } from '@dataview/react/views/gallery/components/Overlay'

const contentInsetStyle = {
  paddingInline: PAGE_INLINE_INSET_CSS
} as const

export const Grid = () => {
  const { t } = useTranslation()
  const {
    active,
    extra,
    runtime
  } = useGalleryContext()
  const engine = useDataView().engine
  const {
    blocks,
    layout
  } = runtime.virtual
  const indicator = runtime.indicator
  const empty = active.items.ids.length === 0
  const sectionSizeByKey = new Map(
    active.sections.all.map(section => [section.key, section.items.count] as const)
  )
  const lastBlock = blocks[blocks.length - 1]
  const bottomSpacerHeight = lastBlock
    ? Math.max(0, layout.totalHeight - lastBlock.top - lastBlock.height)
    : 0
  const groupField = active.query.group.field

  return (
    <div className="flex flex-col gap-6">
      <div
        ref={runtime.containerRef}
        className="relative"
        style={contentInsetStyle}
      >
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

        {empty ? (
          <div className="rounded-3xl border border-dashed bg-card px-6 py-14 text-center text-sm text-muted-foreground">
            {t(token('dataview.react.gallery.emptyView', 'No records in this gallery view.'))}
          </div>
        ) : (
          <div className="relative">
            {blocks.map((block, index) => {
              const previous = blocks[index - 1]
              const marginTop = index === 0
                ? block.top
                : Math.max(0, block.top - previous!.top - previous!.height)

              switch (block.kind) {
                case 'section-header':
                  return (
                    <div
                      key={block.key}
                      className="flex items-center gap-2"
                      style={{
                        height: block.height,
                        marginTop
                      }}
                    >
                      {extra.groupUsesOptionColors ? (
                        <span
                          className="inline-flex h-2.5 w-2.5 rounded-full"
                          style={resolveOptionDotStyle(
                            engine.active.read.section(block.section.key)?.color
                          )}
                        />
                      ) : null}
                      <h3 className="text-sm font-semibold text-foreground">
                        {t(block.section.label)}
                        <span className="ml-2 text-xs font-medium text-muted-foreground">
                          {sectionSizeByKey.get(block.section.key) ?? 0}
                        </span>
                      </h3>
                    </div>
                  )
                case 'section-empty':
                  return (
                    <div
                      key={block.key}
                      className="rounded-3xl border border-dashed bg-card px-6 py-10 text-sm text-muted-foreground"
                      style={{
                        height: block.height,
                        marginTop
                      }}
                    >
                      {t(token('dataview.react.gallery.emptySection', 'No records in this section.'))}
                    </div>
                  )
                case 'row':
                  return (
                    <div
                      key={block.key}
                      className="grid items-start"
                      style={{
                        marginTop,
                        columnGap: GALLERY_CARD_GAP,
                        gridTemplateColumns: `repeat(${layout.columnCount}, minmax(0, 1fr))`
                      }}
                    >
                      {block.row.ids.map(id => (
                        <Card
                          key={id}
                          itemId={id}
                          measureRef={runtime.virtual.measure(id)}
                        />
                      ))}
                    </div>
                  )
              }
            })}
            {bottomSpacerHeight ? (
              <div
                aria-hidden="true"
                style={{
                  height: bottomSpacerHeight
                }}
              />
            ) : null}
          </div>
        )}
      </div>
      <Overlay />
    </div>
  )
}
