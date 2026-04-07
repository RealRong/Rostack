import { Base } from './base'
import { Dropdown } from './dropdown'
import { Reorder } from './reorder'

export const Menu = Object.assign(Base, {
  Reorder,
  Dropdown
})

export type {
  ActionItem as MenuActionItem,
  Controller as MenuController,
  CustomItem as MenuCustomItem,
  DividerItem as MenuDividerItem,
  DropdownProps as MenuDropdownProps,
  Handle as MenuHandle,
  Item as MenuItemRow,
  LabelItem as MenuLabelItem,
  LevelProps as MenuLevelProps,
  MenuItem,
  Path as MenuPath,
  Props as MenuProps,
  ReorderItem as MenuReorderItem,
  ReorderProps as MenuReorderProps,
  SelectionMode as MenuSelectionMode,
  SubmenuItem as MenuSubmenuItem,
  SubmenuOpenPolicy as MenuSubmenuOpenPolicy,
  SurfaceSize as MenuSurfaceSize,
  ToggleItem as MenuToggleItem
} from './types'
