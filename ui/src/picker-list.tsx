import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { cn } from './utils'

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(value, max))

export interface PickerListItem<Key extends string> {
  key: Key
  disabled?: boolean
}

export const usePickerList = <Key extends string>(input: {
  items: readonly PickerListItem<Key>[]
  preferredKey?: Key | null
}) => {
  const itemKeys = useMemo(
    () => input.items
      .filter(item => !item.disabled)
      .map(item => item.key),
    [input.items]
  )
  const [highlightedKey, setHighlightedKey] = useState<Key | null>(null)
  const itemRefs = useRef(new Map<Key, HTMLElement>())
  const id = useId()

  useEffect(() => {
    setHighlightedKey(prev => {
      if (prev && itemKeys.includes(prev)) {
        return prev
      }

      if (input.preferredKey && itemKeys.includes(input.preferredKey)) {
        return input.preferredKey
      }

      return itemKeys[0] ?? null
    })
  }, [input.preferredKey, itemKeys])

  useEffect(() => {
    if (!highlightedKey) {
      return
    }

    itemRefs.current.get(highlightedKey)?.scrollIntoView({
      block: 'nearest'
    })
  }, [highlightedKey])

  const setItemRef = useCallback((
    key: Key,
    node: HTMLElement | null
  ) => {
    if (node) {
      itemRefs.current.set(key, node)
      return
    }

    itemRefs.current.delete(key)
  }, [])

  const moveHighlight = useCallback((delta: number) => {
    if (!itemKeys.length) {
      return
    }

    setHighlightedKey(prev => {
      if (!prev) {
        return delta >= 0
          ? itemKeys[0] ?? null
          : itemKeys[itemKeys.length - 1] ?? null
      }

      const index = itemKeys.indexOf(prev)
      if (index === -1) {
        return delta >= 0
          ? itemKeys[0] ?? null
          : itemKeys[itemKeys.length - 1] ?? null
      }

      return itemKeys[
        clamp(index + delta, 0, itemKeys.length - 1)
      ] ?? null
    })
  }, [itemKeys])

  const moveFirst = useCallback(() => {
    setHighlightedKey(itemKeys[0] ?? null)
  }, [itemKeys])

  const moveLast = useCallback(() => {
    setHighlightedKey(itemKeys[itemKeys.length - 1] ?? null)
  }, [itemKeys])

  const getItemId = useCallback((key: Key) => (
    `${id}-${key}`
  ), [id])

  return {
    highlightedKey,
    setHighlightedKey,
    setItemRef,
    moveNext: () => {
      moveHighlight(1)
    },
    movePrev: () => {
      moveHighlight(-1)
    },
    moveFirst,
    moveLast,
    getItemId
  }
}

export const PickerList = <Key extends string>(props: {
  items: readonly PickerListItem<Key>[]
  highlightedKey: Key | null
  setHighlightedKey: (key: Key | null) => void
  setItemRef: (key: Key, node: HTMLElement | null) => void
  getItemId: (key: Key) => string
  className?: string
  renderItem: (input: {
    item: PickerListItem<Key>
    highlighted: boolean
    id: string
    ref: (node: HTMLElement | null) => void
  }) => ReactNode
}) => (
  <div className={cn('flex flex-col', props.className)}>
    {props.items.map(item => props.renderItem({
      item,
      highlighted: props.highlightedKey === item.key,
      id: props.getItemId(item.key),
      ref: node => {
        props.setItemRef(item.key, node)
      }
    }))}
  </div>
)
