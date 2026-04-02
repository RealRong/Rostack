import {
  createContext,
  createElement,
  useContext,
  useRef,
  type ReactNode,
  type RefObject
} from 'react'
import type { ViewId } from '@dataview/core/contracts'

export interface GalleryProviderProps {
  viewId: ViewId
  children?: ReactNode
}

export interface Layout {
  containerRef: RefObject<HTMLDivElement | null>
}

export interface Gallery {
  viewId: ViewId
  layout: Layout
}

type Value = Gallery

const Ctx = createContext<Value | null>(null)

export const GalleryProvider = (props: GalleryProviderProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const layout: Layout = {
    containerRef
  }
  const value: Value = {
    viewId: props.viewId,
    layout
  }

  return createElement(Ctx.Provider, { value }, props.children)
}

export const useGalleryContext = (): Gallery => {
  const value = useContext(Ctx)
  if (!value) {
    throw new Error('Missing GalleryProvider.')
  }
  return value
}
