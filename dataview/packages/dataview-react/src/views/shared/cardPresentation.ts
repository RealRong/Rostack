import type {
  CardLayout,
  CardSize
} from '@dataview/core/types'
import type {
  FieldOptionTagAppearance
} from '@dataview/react/field/options'
import { cn } from '@shared/ui/utils'
import type { CardContentSlots } from '@dataview/react/views/shared/CardContent'

export const resolveCardPresentation = (input: {
  size: CardSize
  layout: CardLayout
  selected?: boolean
  hasVisibleFields: boolean
}): {
  propertyDensity: 'default' | 'compact'
  fieldAppearance: {
    optionTag: FieldOptionTagAppearance
  }
  slots: CardContentSlots
} => {
  const rootPadding = input.layout === 'stacked'
    ? 'p-3'
    : 'px-3 py-2.5'

  if (input.layout === 'stacked') {
    const titleText = 'text-base font-semibold leading-6'
    const valueText = 'text-[12px]'
    const propertyGap = 'gap-2'
    const titlePadding = input.hasVisibleFields
      ? 'pb-1.5'
      : ''

    return {
      propertyDensity: 'default',
      fieldAppearance: {
        optionTag: 'card'
      },
      slots: {
        root: cn(
          'relative h-full rounded-xl transition-colors',
          rootPadding,
          input.selected && 'bg-accent-overlay'
        ),
        title: {
          row: cn('flex min-w-0 items-start gap-2.5', titlePadding),
          content: 'min-w-0 flex-1',
          text: titleText,
          input: cn(titleText, 'text-foreground')
        },
        property: {
          list: cn('flex flex-col', propertyGap),
          item: 'min-w-0 h-fit flex items-center',
          value: valueText
        }
      }
    }
  }

  const compactValueText = 'text-sm text-foreground'
  const compactGap = 'gap-1.5 mt-1'

  return {
    propertyDensity: 'compact',
    fieldAppearance: {
      optionTag: 'card'
    },
    slots: {
      root: cn(
        'relative rounded-xl transition-colors',
        rootPadding,
        input.selected && 'bg-accent-overlay'
      ),
      title: {
        row: 'min-w-0',
        content: 'min-w-0 flex-1 w-full',
        text: 'font-semibold',
        input: 'font-semibold text-foreground'
      },
      property: {
        list: cn('flex flex-wrap items-center', compactGap),
        item: 'inline-flex min-w-0 max-w-full',
        value: compactValueText
      }
    }
  }
}
