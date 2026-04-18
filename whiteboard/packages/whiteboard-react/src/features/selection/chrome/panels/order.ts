export const ORDER_MENU_ITEMS = [
  { key: 'order.front', label: 'Bring to front', mode: 'front' as const },
  { key: 'order.forward', label: 'Bring forward', mode: 'forward' as const },
  { key: 'order.backward', label: 'Send backward', mode: 'backward' as const },
  { key: 'order.back', label: 'Send to back', mode: 'back' as const }
] as const
