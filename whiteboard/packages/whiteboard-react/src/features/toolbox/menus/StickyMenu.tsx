import { PickerGridButton, PickerSection } from '@shared/ui'
import {
  STICKY_MENU_SECTIONS
} from '@whiteboard/react/features/palette'

const StickySwatch = ({
  fill
}: {
  fill: string
}) => (
  <span className="inline-flex h-full w-full items-center justify-center">
    <span
      className="block shadow-sm"
      style={{
        width: '100%',
        height: '100%',
        background: fill
      }}
    />
  </span>
)

export const StickyMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => {
  return (
    <div className="flex flex-col w-[190px] gap-5 p-1">
      {STICKY_MENU_SECTIONS.map((section) => {
        return (
          <PickerSection key={section.key} title={section.title}>
            <div
              className="grid gap-2.5"
              style={{
                gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))`
              }}
            >
              {section.items.map((item) => (
                <div
                  key={item.key}
                  className={`items-center justify-center hover:-translate-y-0.5 transition duration-200 cursor-pointer rounded-lg p-0 ${section.aspectClassName}`}
                  onClick={() => onChange(item.key)}
                  aria-label={item.label}
                  title={item.title}
                >
                  <StickySwatch
                    fill={item.fill}
                  />
                </div>
              ))}
            </div>
          </PickerSection>
        )
      })}
    </div>
  )
}
