import type { Placement } from '@floating-ui/react'
import type { ReactElement, ReactNode } from 'react'
import type {
  PopoverOffset,
  PopoverContentProps,
  PopoverProps,
  PopoverSurfacePadding,
  PopoverSurfaceSize
} from '@shared/ui/popover'
import type {
  ListCustomItem,
  ListDividerItem,
  ListLabelItem
} from '@shared/ui/list-structure'

export type MenuPresentation = 'cascade' | 'dropdown'
export type MenuPopoverContent = ReactNode | (() => ReactNode)

export interface ActionItem {
  kind: 'action'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  accessory?: ReactNode
  disabled?: boolean
  tone?: 'default' | 'destructive'
  closeOnSelect?: boolean
  className?: string
  highlightedClassName?: string
  onSelect: () => void
}

export interface Item {
  kind: 'item'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  accessory?: ReactNode
  disabled?: boolean
  tone?: 'default' | 'destructive'
  indicator?: 'none' | 'check' | 'switch'
  closeOnSelect?: boolean
  onSelect?: () => void
  className?: string
  highlightedClassName?: string
}

export interface ToggleItem {
  kind: 'toggle'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  accessory?: ReactNode
  checked: boolean
  indicator?: 'check' | 'switch'
  disabled?: boolean
  closeOnSelect?: boolean
  className?: string
  highlightedClassName?: string
  onSelect: () => void
}

export interface SubmenuItem {
  kind: 'submenu'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  accessory?: ReactNode
  disabled?: boolean
  tone?: 'default' | 'destructive'
  items?: readonly MenuItem[]
  content?: MenuPopoverContent
  size?: PopoverSurfaceSize
  padding?: PopoverSurfacePadding
  surface?: 'list' | 'panel'
  contentClassName?: string
  className?: string
  highlightedClassName?: string
  presentation?: MenuPresentation
  placement?: Placement
  offset?: PopoverOffset
}

export type DividerItem = ListDividerItem
export type LabelItem = ListLabelItem
export type CustomItem = ListCustomItem

export type MenuItem =
  | Item
  | ActionItem
  | ToggleItem
  | SubmenuItem
  | DividerItem
  | LabelItem
  | CustomItem

export type SubmenuOpenPolicy = 'hover' | 'click'
export type SurfaceSize = PopoverSurfaceSize
export type SurfacePadding = PopoverSurfacePadding
export type SelectionMode = 'none' | 'single' | 'multiple'
export type SelectionAppearance = 'none' | 'content' | 'row'
export type SubmenuOpenSource = 'pointer' | 'keyboard'
export type SubmenuCloseReason = 'trigger' | 'outside' | 'keyboard'
export type MenuMove = 'next' | 'prev' | 'first' | 'last'
export type MenuActiveDefault =
  | 'first'
  | 'last'
  | 'preserve'
  | 'preserve-or-first'
  | { key: string }
  | ((items: readonly MenuItem[], currentKey: string | null) => string | null)

export interface Handle {
  move: (mode: MenuMove) => void
  clearActive: () => void
  getActiveKey: () => string | null
}

export interface DropdownProps extends Omit<PopoverProps, 'children'>, Omit<PopoverContentProps, 'children' | 'padding'> {
  items: readonly MenuItem[]
  autoFocus?: boolean
  selectionAppearance?: SelectionAppearance
  submenuOpenPolicy?: SubmenuOpenPolicy
  trigger: ReactElement
}

export interface Props {
  items: readonly MenuItem[]
  defaultActive?: MenuActiveDefault
  value?: string | readonly string[]
  defaultValue?: string | readonly string[]
  onValueChange?: (value: string | readonly string[]) => void
  selectionMode?: SelectionMode
  selectionAppearance?: SelectionAppearance
  onClose?: () => void
  autoFocus?: boolean
  className?: string
  submenuOpenPolicy?: SubmenuOpenPolicy
  open?: boolean
  openSubmenuKey?: string | null
  onOpenSubmenuChange?: (key: string | null) => void
  reorder?: (input: {
    key: string
    before?: string
  }) => void
}

export type Path = readonly string[]
export type ActiveSource = 'pointer' | 'keyboard' | null

export interface Controller {
  activePath: Path
  activeSource: ActiveSource
  openPath: Path
  registerItemRef: (path: Path, element: HTMLElement | null) => void
  setActivePointerPath: (path: Path) => void
  setActiveKeyboardPath: (path: Path) => void
  clearActivePath: () => void
  clearPointerActivePath: () => void
  trimOpenPath: (path: Path) => void
  markTriggerPress: (path: Path) => void
  consumeTriggerPress: (path: Path) => boolean
  closeSubmenuPath: (path: Path, reason: SubmenuCloseReason) => void
  openSubmenuPath: (path: Path, item: SubmenuItem, source: SubmenuOpenSource) => void
}

export interface LevelProps {
  items: readonly MenuItem[]
  parentPath: Path
  open: boolean
  autoFocus: boolean
  selectedKeys: readonly string[]
  selectionMode: SelectionMode
  selectionAppearance: SelectionAppearance
  onItemValueToggle: (itemKey: string) => void
  onClose?: () => void
  onRequestClose?: () => void
  submenuOpenPolicy: SubmenuOpenPolicy
  controller: Controller
  reorder?: {
    onMove: (from: number, to: number) => void
  }
}
