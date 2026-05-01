import { Base } from '@shared/ui/menu/base'
import { Dropdown } from '@shared/ui/menu/dropdown'

export const Menu = Object.assign(Base, {
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
  MenuMove,
  Path as MenuPath,
  Props as MenuProps,
  SelectionAppearance as MenuSelectionAppearance,
  SelectionMode as MenuSelectionMode,
  SurfacePadding as MenuSurfacePadding,
  SubmenuItem as MenuSubmenuItem,
  SubmenuOpenPolicy as MenuSubmenuOpenPolicy,
  SurfaceSize as MenuSurfaceSize,
  ToggleItem as MenuToggleItem
} from '@shared/ui/menu/types'
