import {
  createContext,
  createElement,
  useContext,
  useRef,
  type ReactNode
} from 'react'
import type { ViewId } from '@dataview/core/contracts'
import {
  type GalleryController,
  useGalleryController
} from './useGalleryController'

export interface GalleryProviderProps {
  viewId: ViewId
  children?: ReactNode
}

export type Gallery = GalleryController

const Ctx = createContext<Gallery | null>(null)

export const GalleryProvider = (props: GalleryProviderProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const value = useGalleryController({
    viewId: props.viewId,
    containerRef
  })

  return createElement(Ctx.Provider, { value }, props.children)
}

export const useGalleryContext = (): Gallery => {
  const value = useContext(Ctx)
  if (!value) {
    throw new Error('Missing GalleryProvider.')
  }
  return value
}
