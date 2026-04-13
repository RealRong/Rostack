import { PickerGridButton, PickerSection } from '@shared/ui'
import {
  SHAPE_MENU_SECTIONS,
  readShapePreviewFill
} from '@whiteboard/core/node'
import {
  ShapeGlyph
} from '#whiteboard-react/features/node'
import { readShapePresetKind } from '#whiteboard-react/features/toolbox/presets'

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
        <PickerSection key={section.key} title={section.title}>
          <div className="grid grid-cols-5 gap-2">
            {section.items.map((item) => {
              const preset = `shape.${item.kind}`
              const active = activeKind === item.kind

              return (
                <PickerGridButton
                  key={preset}
                  type="button"
                  className="aspect-square items-center justify-center"
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
                </PickerGridButton>
              )
            })}
          </div>
        </PickerSection>
      ))}
    </>
  )
}
