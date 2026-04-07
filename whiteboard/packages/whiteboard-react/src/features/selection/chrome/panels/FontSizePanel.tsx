import { Button, cn } from '@ui'

const FONT_SIZE_PRESETS = [10, 12, 14, 18, 24, 36, 48, 64, 80, 144, 288] as const

export const FontSizePanel = ({
  value,
  onChange
}: {
  value?: number
  onChange: (value: number) => void
}) => {
  return (
    <div className="flex flex-col gap-1 w-20 p-2">
      {FONT_SIZE_PRESETS.map((preset, index) => (
        <Button
          key={preset}
          variant={'ghost'}
          className={cn(
            'font-medium text-fg transition-colors',
            value === preset && 'bg-pressed'
          )}
          onClick={() => onChange(preset)}
        >
          {preset}
        </Button>
      ))}
    </div>
  )
}
