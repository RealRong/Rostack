import { Base } from '#ui/menu/base.tsx'
import { Dropdown } from '#ui/menu/dropdown.tsx'
import { Reorder } from '#ui/menu/reorder.tsx'

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
  SelectionAppearance as MenuSelectionAppearance,
  SelectionMode as MenuSelectionMode,
  SubmenuItem as MenuSubmenuItem,
  SubmenuOpenPolicy as MenuSubmenuOpenPolicy,
  SurfaceSize as MenuSurfaceSize,
  ToggleItem as MenuToggleItem
} from '#ui/menu/types.ts'
