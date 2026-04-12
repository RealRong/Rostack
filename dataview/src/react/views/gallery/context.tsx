import {
  createContext,
  createElement,
  useContext,
  useRef,
  type ReactNode
} from 'react'
import type { ActiveViewState } from '@dataview/engine'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import {
  type GalleryController,
  type GalleryCurrentView,
  useGalleryController
} from './useGalleryController'

export interface GalleryProviderProps {
  children?: ReactNode
}

export type Gallery = GalleryController

const Ctx = createContext<Gallery | null>(null)

const readGalleryCurrentView = (
  state: ActiveViewState | undefined,
  sections: GalleryCurrentView['sections']
): GalleryCurrentView | undefined => (
  state?.view.type === 'gallery'
    ? {
        ...state,
        view: state.view,
        sections
      } as GalleryCurrentView
    : undefined
)

export const GalleryProvider = (props: GalleryProviderProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const extra = useDataViewValue(
    dataView => dataView.engine.active.gallery.state
  )
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => extra
      ? readGalleryCurrentView(state, extra.sections)
      : undefined
  )
  if (!extra || !currentView) {
    throw new Error('Gallery view requires an active gallery state.')
  }
  const value = useGalleryController({
    containerRef,
    currentView,
    extra
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
