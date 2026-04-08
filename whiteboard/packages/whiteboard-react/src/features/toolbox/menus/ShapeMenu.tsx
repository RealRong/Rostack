import {
  SHAPE_MENU_SECTIONS,
  readShapePreviewFill
} from '@whiteboard/core/node'
import { cn } from '@ui'
import {
  ShapeGlyph
} from '#react/features/node'
import { readShapePresetKind } from '../presets'
import {
  TOOLBOX_GRID_BUTTON_CLASSNAME,
  ToolboxButton,
  ToolboxMenuSection
} from '../primitives'

export const ShapeMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => {
  const activeKind = readShapePresetKind(value)

  return (
    <>
      {SHAPE_MENU_SECTIONS.map((section) => (
        <ToolboxMenuSection key={section.key} title={section.title}>
          <div className="grid grid-cols-5 gap-2">
            {section.items.map((item) => {
              const preset = `shape.${item.kind}`
              const active = activeKind === item.kind

              return (
                <ToolboxButton
                  key={preset}
                  type="button"
                  className={cn(
                    TOOLBOX_GRID_BUTTON_CLASSNAME,
                    'aspect-square items-center justify-center',
                    active && '[box-shadow:inset_0_0_0_1px_rgb(from_var(--ui-accent)_r_g_b_/_0.45)]'
                  )}
                  pressed={active}
                  onClick={() => onChange(preset)}
                  aria-label={item.label}
                  title={item.label}
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
                </ToolboxButton>
              )
            })}
          </div>
        </ToolboxMenuSection>
      ))}
    </>
  )
}
