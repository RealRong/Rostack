import { cn } from '@ui'
import {
  STICKY_INSERT_OPTIONS,
  STICKY_INSERT_PRESETS
} from '../presets'
import {
  TOOLBOX_GRID_BUTTON_CLASSNAME,
  ToolboxButton,
  ToolboxMenuSection
} from '../primitives'

export const StickyMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <ToolboxMenuSection title="Sticky notes">
    <div className="grid grid-cols-4 gap-2">
      {STICKY_INSERT_PRESETS.map((preset, index) => {
        const option = STICKY_INSERT_OPTIONS[index]
        return (
          <ToolboxButton
            key={preset.key}
            type="button"
            className={cn(
              TOOLBOX_GRID_BUTTON_CLASSNAME,
              'aspect-square flex-col items-stretch gap-1.5',
              value === preset.key && '[box-shadow:inset_0_0_0_1px_rgb(from_var(--ui-accent)_r_g_b_/_0.45)]'
            )}
            pressed={value === preset.key}
            onClick={() => onChange(preset.key)}
            aria-label={preset.label}
            title={preset.label}
          >
            <span
              className="relative h-full w-full overflow-hidden rounded-none border-none shadow-[inset_0_1px_0_rgb(from_var(--ui-surface)_r_g_b_/_0.14)]"
              style={{
                background: option.fill
              }}
            >
              <span className="absolute right-0 top-0 h-3 w-3 bg-[linear-gradient(135deg,rgb(from_var(--ui-surface)_r_g_b_/_0.56)_0%,rgb(from_var(--ui-surface)_r_g_b_/_0)_100%)]" />
            </span>
          </ToolboxButton>
        )
      })}
    </div>
  </ToolboxMenuSection>
)
