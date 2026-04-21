import type {
  ItemId
} from '@dataview/engine'
import {
  targetElement
} from '@shared/dom'

const itemIdByNode = new WeakMap<Element, ItemId>()

export const itemDomBridge = {
  bind: {
    node: (
      node: Element,
      itemId: ItemId
    ) => {
      itemIdByNode.set(node, itemId)
    }
  },
  read: {
    node: (
      node: Element | null
    ): ItemId | undefined => (
      node
        ? itemIdByNode.get(node)
        : undefined
    ),
    closest: (
      target: EventTarget | null
    ): ItemId | undefined => {
      let current = targetElement(target)
      while (current instanceof Element) {
        const itemId = itemIdByNode.get(current)
        if (itemId !== undefined) {
          return itemId
        }

        current = current.parentElement
      }

      return undefined
    }
  },
  clear: {
    node: (node: Element) => {
      itemIdByNode.delete(node)
    }
  }
} as const
