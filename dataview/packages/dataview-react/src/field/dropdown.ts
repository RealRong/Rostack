import type { MenuSubmenuItem } from '@shared/ui/menu'

export const FIELD_DROPDOWN_MENU_PROPS = {
  presentation: 'dropdown',
  placement: 'bottom-end'
} satisfies Pick<MenuSubmenuItem, 'presentation' | 'placement'>
