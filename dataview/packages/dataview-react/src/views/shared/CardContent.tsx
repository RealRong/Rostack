import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode
} from 'react'
import { cn } from '@shared/ui/utils'

export interface CardContentPropertyNode {
  key: string
  node: ReactNode
}

export interface CardContentSlots {
  root?: string
  title?: {
    row?: string
    content?: string
    text?: string
    input?: string
  }
  property?: {
    list?: string
    item?: string
    value?: string
  }
}

export interface CardContentProps extends Omit<ComponentPropsWithoutRef<'article'>, 'children'> {
  slots?: CardContentSlots
  titleNode: ReactNode
  properties?: readonly CardContentPropertyNode[]
}

export const CardContent = forwardRef<HTMLElement, CardContentProps>((props, ref) => {
  const {
    slots,
    titleNode,
    properties,
    className,
    ...rootProps
  } = props
  return (
    <article
      {...rootProps}
      ref={ref}
      className={cn(slots?.root, className)}
    >
      <div className={cn('min-w-0', slots?.title?.row)}>
        {titleNode}
      </div>

      {properties?.length ? (
        <div className={slots?.property?.list}>
          {properties.map(property => (
            <div key={property.key} className={slots?.property?.item}>
              {property.node}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
})

CardContent.displayName = 'CardContent'
