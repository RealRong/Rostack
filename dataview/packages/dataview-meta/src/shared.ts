import type { MessageSpec } from '@dataview/meta/message'

export interface MetaDescriptor {
  id: string
  message: MessageSpec
}

export interface MetaCollection<TItem extends MetaDescriptor> {
  list: readonly TItem[]
  get: (id?: string) => TItem
}

export const defineMetaCollection = <TItem extends MetaDescriptor>(
  items: readonly TItem[],
  options: {
    defaultId?: string
    fallback: (id?: string) => TItem
  }
): MetaCollection<TItem> => {
  const itemMap = new Map(items.map(item => [item.id, item] as const))

  return {
    list: items,
    get: (id?: string) => {
      if (id && itemMap.has(id)) {
        return itemMap.get(id)!
      }

      if ((id === undefined || id === '') && options.defaultId && itemMap.has(options.defaultId)) {
        return itemMap.get(options.defaultId)!
      }

      return options.fallback(id)
    }
  }
}
