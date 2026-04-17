import type {
  CardLayout,
  CardSize
} from '@dataview/core/contracts'
import { cn } from '@shared/ui/utils'
import type { CardContentProps } from '@dataview/react/views/shared/CardContent'

export const resolveCardPresentation = (input: {
  size: CardSize
  layout: CardLayout
  selected?: boolean
  hasVisibleFields: boolean
}): {
  propertyDensity: NonNullable<CardContentProps['propertyDensity']>
  slots: NonNullable<CardContentProps['slots']>
} => {
  const rootPadding = (() => {
    switch (input.size) {
      case 'sm':
        return input.layout === 'stacked'
          ? 'p-2.5'
          : 'px-2.5 py-2'
      case 'lg':
        return input.layout === 'stacked'
          ? 'p-4'
          : 'px-3.5 py-3'
      case 'md':
      default:
        return input.layout === 'stacked'
          ? 'p-3'
          : 'px-3 py-2.5'
    }
  })()

  if (input.layout === 'stacked') {
    const titleText = (() => {
      switch (input.size) {
        case 'sm':
          return 'text-sm font-semibold leading-5'
        case 'lg':
          return 'text-lg font-semibold leading-7'
        case 'md':
        default:
          return 'text-base font-semibold leading-6'
      }
    })()
    const valueText = (() => {
      switch (input.size) {
        case 'sm':
          return 'text-[11px]'
        case 'lg':
          return 'text-sm'
        case 'md':
        default:
          return 'text-[12px]'
      }
    })()
    const propertyGap = input.size === 'lg'
      ? 'gap-2.5'
      : input.size === 'sm'
        ? 'gap-1.5'
        : 'gap-2'
    const titlePadding = input.hasVisibleFields
      ? input.size === 'lg'
        ? 'pb-2.5'
        : input.size === 'sm'
          ? 'pb-1.5'
          : 'pb-2'
      : ''

    return {
      propertyDensity: 'default',
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

  const compactTitleText = (() => {
    switch (input.size) {
      case 'sm':
        return 'text-sm font-semibold leading-5'
      case 'lg':
        return 'text-[15px] font-semibold leading-6'
      case 'md':
      default:
        return 'font-semibold'
    }
  })()
  const compactValueText = input.size === 'sm'
    ? 'text-xs text-foreground'
    : 'text-sm text-foreground'
  const compactGap = input.size === 'lg'
    ? 'gap-2.5 mt-1.5'
    : input.size === 'sm'
      ? 'gap-1.5 mt-1'
      : 'gap-2 mt-1'

  return {
    propertyDensity: 'compact',
    slots: {
      root: cn('relative rounded-xl transition-colors', rootPadding),
      title: {
        content: 'min-w-0 flex-1 w-full',
        text: compactTitleText,
        input: cn(compactTitleText, 'text-foreground')
      },
      property: {
        list: cn('flex flex-wrap items-center', compactGap),
        item: 'inline-flex min-w-0 max-w-full',
        value: compactValueText
      }
    }
  }
}
