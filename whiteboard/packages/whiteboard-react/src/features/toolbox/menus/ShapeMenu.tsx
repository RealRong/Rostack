import { PickerGridButton, PickerSection } from '@shared/ui'
import { product } from '@whiteboard/product'
import {
  ShapeGlyph
} from '@whiteboard/react/features/node'

export const ShapeMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => {
  const activeKind = product.insert.catalog.readWhiteboardShapePresetKind(value)

  return (
    <>
      {product.node.shapes.WHITEBOARD_SHAPE_MENU_SECTIONS.map((section) => (
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
                      fill={product.node.shapes.readWhiteboardShapePreviewFill(item.kind)}
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
