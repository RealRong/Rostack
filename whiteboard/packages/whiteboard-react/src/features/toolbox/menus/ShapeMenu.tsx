import {
  SHAPE_MENU_SECTIONS,
  readShapePreviewFill
} from '@whiteboard/core/node'
import { MenuSection } from '../../selection/chrome/menus/MenuPrimitives'
import {
  ShapeGlyph
} from '../../node/shape'
import { readShapePresetKind } from '../presets'

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
        <MenuSection key={section.key} title={section.title}>
          <div className="wb-left-toolbar-shape-grid">
            {section.items.map((item) => {
              const preset = `shape.${item.kind}`
              const active = activeKind === item.kind

              return (
                <button
                  key={preset}
                  type="button"
                  className="wb-left-toolbar-shape-option"
                  data-active={active ? 'true' : undefined}
                  onClick={() => onChange(preset)}
                  data-selection-ignore
                  data-input-ignore
                  aria-label={item.label}
                  title={item.label}
                >
                  <span className="wb-left-toolbar-shape-glyph">
                    <ShapeGlyph
                      kind={item.kind}
                      width={32}
                      height={24}
                      className="wb-left-toolbar-shape-glyph-svg"
                      fill={readShapePreviewFill(item.kind)}
                      stroke="currentColor"
                      strokeWidth={4}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        </MenuSection>
      ))}
    </>
  )
}
