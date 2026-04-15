import { useCallback, useEffect, useMemo } from 'react'
import { createKeyedStore, type KeyedReadStore } from '@shared/core'
import {
  readEdgeLabelTextSourceId
} from '@whiteboard/editor'
import {
  createMeasuredElementObserver,
  type ElementSize
} from '@shared/dom'

const SIZE_EPSILON = 0.5

const isSameSize = (
  left: ElementSize | undefined,
  right: ElementSize | undefined
) => (
  left === right
  || (
    left !== undefined
    && right !== undefined
    && Math.abs(left.width - right.width) < SIZE_EPSILON
    && Math.abs(left.height - right.height) < SIZE_EPSILON
  )
)

const isValidSize = (
  size: ElementSize
) => (
  Number.isFinite(size.width)
  && Number.isFinite(size.height)
  && size.width > 0
  && size.height > 0
)

export const readEdgeLabelMeasureKey = (
  edgeId: string,
  labelId: string
) => readEdgeLabelTextSourceId(edgeId, labelId)

export type EdgeLabelSizeObserver = {
  sizes: KeyedReadStore<string, ElementSize | undefined>
  register: (
    key: string,
    element: HTMLDivElement | null
  ) => void
}

export const useEdgeLabelSizeObserver = (): EdgeLabelSizeObserver => {
  const sizes = useMemo(
    () => createKeyedStore<string, ElementSize | undefined>({
      emptyValue: undefined,
      isEqual: isSameSize
    }),
    []
  )

  const observer = useMemo(
    () => createMeasuredElementObserver<string, HTMLDivElement>({
      isEqual: (left, right) => isSameSize(left, right),
      schedule: 'raf',
      onChange: (changes) => {
        const set = changes.flatMap(({ key, size }) => isValidSize(size)
          ? [[key, size] as const]
          : []
        )
        const deleteKeys = changes.flatMap(({ key, size }) => isValidSize(size)
          ? []
          : [key]
        )

        if (set.length > 0 || deleteKeys.length > 0) {
          sizes.patch({
            set,
            delete: deleteKeys
          })
        }
      }
    }),
    [sizes]
  )

  useEffect(
    () => () => {
      observer.disconnect()
    },
    [observer]
  )

  const register = useCallback((
    key: string,
    element: HTMLDivElement | null
  ) => {
    if (!element) {
      observer.unobserve(key)
      sizes.patch({
        delete: [key]
      })
      return
    }

    observer.observe(key, element)
  }, [observer, sizes])

  return useMemo(
    () => ({
      sizes,
      register
    }),
    [register, sizes]
  )
}
