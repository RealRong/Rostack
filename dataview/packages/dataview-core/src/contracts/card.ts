export type CardSize = 'sm' | 'md' | 'lg'
export type CardLayout = 'compact' | 'stacked'

export interface CardOptions {
  wrap: boolean
  size: CardSize
  layout: CardLayout
}
