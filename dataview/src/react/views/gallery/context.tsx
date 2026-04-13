import {
  createContext,
  createElement,
  useContext,
  useMemo,
  type ReactNode
} from 'react'
import type { GalleryState } from '@dataview/engine'
import type { ViewState } from '@dataview/engine'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import {
  type GalleryActiveState,
  type GalleryRuntime,
  useGalleryRuntime
} from './runtime'

export interface GalleryProviderProps {
  children?: ReactNode
}

export interface GalleryContextValue {
  active: GalleryActiveState
  extra: GalleryState
  runtime: GalleryRuntime
}

export type Gallery = GalleryContextValue

const Ctx = createContext<Gallery | null>(null)

const readGalleryActiveState = (
  state: ViewState | undefined
): GalleryActiveState | undefined => (
  state?.view.type === 'gallery'
    ? state as GalleryActiveState
    : undefined
)

export const GalleryProvider = (props: GalleryProviderProps) => {
  const active = useDataViewValue(
    dataView => dataView.engine.view.state,
    readGalleryActiveState
  )
  const extra = useDataViewValue(
    dataView => dataView.engine.view.gallery.state
  )
  if (!active || !extra) {
    throw new Error('Gallery view requires an active gallery state.')
  }
  const runtime = useGalleryRuntime({
    active,
    extra
  })
  const value = useMemo<GalleryContextValue>(() => ({
    active,
    extra,
    runtime
  }), [
    active,
    extra,
    runtime
  ])

  return createElement(Ctx.Provider, { value }, props.children)
}

export const useGalleryContext = (): Gallery => {
  const value = useContext(Ctx)
  if (!value) {
    throw new Error('Missing GalleryProvider.')
  }
  return value
}
