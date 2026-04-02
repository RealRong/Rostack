import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'

const clamp = (
  value: number,
  min: number,
  max: number
) => Math.max(min, Math.min(value, max))

export interface ListHighlightItem<Key extends string> {
  key: Key
}

export const useListHighlight = <Key extends string>(input: {
  items: readonly ListHighlightItem<Key>[]
  preferredKey?: Key | null
}) => {
  const itemKeys = useMemo(
    () => input.items.map(item => item.key),
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

  const getItemId = useCallback((key: Key) => (
    `${id}-${key}`
  ), [id])

  return {
    highlightedKey,
    setHighlightedKey,
    setItemRef,
    moveHighlight,
    moveNext: () => {
      moveHighlight(1)
    },
    movePrev: () => {
      moveHighlight(-1)
    },
    getItemId
  }
}
