import type { Placement } from '@floating-ui/react'
import type { ReactNode } from 'react'
import type {
  PopoverOffset,
  PopoverProps,
  PopoverSurfacePadding,
  PopoverSurfaceSize
} from '../popover'
import type {
  ListCustomItem,
  ListDividerItem,
  ListLabelItem
} from '../list-structure'

export type MenuPresentation = 'cascade' | 'dropdown'
export type MenuPopoverContent = ReactNode | (() => ReactNode)

export interface ActionItem {
  kind: 'action'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
  tone?: 'default' | 'destructive'
  closeOnSelect?: boolean
  onSelect: () => void
}

export interface Item {
  kind: 'item'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
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
  checked: boolean
  indicator?: 'check' | 'switch'
  disabled?: boolean
  closeOnSelect?: boolean
  onSelect: () => void
}

export interface SubmenuItem {
  kind: 'submenu'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
  items?: readonly MenuItem[]
  content?: MenuPopoverContent
  size?: PopoverSurfaceSize
  surface?: 'list' | 'panel'
  contentClassName?: string
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

export interface ReorderItem extends Omit<Item, 'kind'> {
  handleAriaLabel: string
  handleIcon?: ReactNode
  content?: MenuPopoverContent
  size?: PopoverSurfaceSize
  padding?: PopoverSurfacePadding
  contentClassName?: string
  presentation?: MenuPresentation
  placement?: Placement
  offset?: PopoverOffset
}

export type SubmenuOpenPolicy = 'hover' | 'click'
export type SurfaceSize = PopoverSurfaceSize
export type SelectionMode = 'none' | 'single' | 'multiple'

export interface Handle {
  moveNext: () => void
  movePrev: () => void
  moveFirst: () => void
  moveLast: () => void
  clearActive: () => void
  getActiveKey: () => string | null
}

export interface DropdownProps extends Omit<PopoverProps, 'children' | 'padding'> {
  items: readonly MenuItem[]
  autoFocus?: boolean
  submenuOpenPolicy?: SubmenuOpenPolicy
}

export interface Props {
  items: readonly MenuItem[]
  value?: string | readonly string[]
  defaultValue?: string | readonly string[]
  onValueChange?: (value: string | readonly string[]) => void
  selectionMode?: SelectionMode
  onClose?: () => void
  autoFocus?: boolean
  className?: string
  submenuOpenPolicy?: SubmenuOpenPolicy
  open?: boolean
  openSubmenuKey?: string | null
  onOpenSubmenuChange?: (key: string | null) => void
}

export interface ReorderProps {
  items: readonly ReorderItem[]
  value?: string | readonly string[]
  defaultValue?: string | readonly string[]
  onValueChange?: (value: string | readonly string[]) => void
  selectionMode?: SelectionMode
  onMove: (from: number, to: number) => void
  onClose?: () => void
  className?: string
  openItemKey?: string | null
  onOpenItemChange?: (key: string | null) => void
}

export type Path = readonly string[]
export type ActiveSource = 'pointer' | 'keyboard' | null

export interface Controller {
  activePath: Path
  activeSource: ActiveSource
  expandedPath: Path
  registerItemRef: (path: Path, element: HTMLButtonElement | null) => void
  setActivePointerPath: (path: Path) => void
  setActiveKeyboardPath: (path: Path) => void
  clearPointerActivePath: () => void
  trimExpandedPath: (path: Path) => void
  dismissSubmenuPath: (path: Path) => void
  collapseSubmenuPathToTrigger: (path: Path) => void
  openSubmenuPath: (path: Path, item: SubmenuItem, source: 'pointer' | 'keyboard' | 'click') => void
}

export interface LevelProps {
  items: readonly MenuItem[]
  parentPath: Path
  open: boolean
  autoFocus: boolean
  selectedKeys: readonly string[]
  selectionMode: SelectionMode
  onItemValueToggle: (itemKey: string) => void
  onClose?: () => void
  onRequestClose?: () => void
  submenuOpenPolicy: SubmenuOpenPolicy
  controller: Controller
}

