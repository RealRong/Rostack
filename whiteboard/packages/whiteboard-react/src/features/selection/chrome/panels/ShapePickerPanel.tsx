import {
  SHAPE_MENU_SECTIONS,
  readShapePreviewFill,
  type ShapeKind
} from '@whiteboard/core/node'
import { Button, cn } from '@ui'
import { ShapeGlyph } from '../../../node/shape'
import { Panel, PanelSection } from './ShapeToolbarPrimitives'

export const ShapePickerPanel = ({
  value,
  onChange
}: {
  value?: ShapeKind
  onChange: (value: ShapeKind) => void
}) => (
  <Panel className="min-w-[280px]">
    {SHAPE_MENU_SECTIONS.map((section) => (
      <PanelSection key={section.key} title={section.title}>
        <div className="grid grid-cols-5 gap-2">
          {section.items.map((item) => {
            const active = value === item.kind

            return (
              <Button
                key={item.kind}
                variant="outline"
                className={cn(
                  'h-12 rounded-xl p-0',
                  active && 'border-accent bg-pressed'
                )}
                pressed={active}
                onClick={() => onChange(item.kind)}
                title={item.label}
                aria-label={item.label}
              >
                <span className="inline-flex h-full w-full items-center justify-center">
                  <ShapeGlyph
                    kind={item.kind}
                    width={32}
                    height={24}
                    className="block h-6 w-8 overflow-visible"
                    fill={readShapePreviewFill(item.kind)}
                    stroke="currentColor"
                    strokeWidth={4}
                  />
                </span>
              </Button>
            )
          })}
        </div>
      </PanelSection>
    ))}
  </Panel>
)
