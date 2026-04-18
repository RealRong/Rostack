import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from 'react'
import type {
  GalleryState,
  ViewState
} from '@dataview/engine'
import {
  readActiveTypedViewState
} from '@dataview/runtime'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import { Grid } from '@dataview/react/views/gallery/components/Grid'
import {
  useGalleryRuntime
} from '@dataview/react/views/gallery/runtime'
import type {
  ActiveGalleryViewState,
  GalleryViewRuntime
} from '@dataview/react/views/gallery/types'

export interface GalleryViewProps {}

export interface GalleryProviderProps {
  children?: ReactNode
}

const Ctx = createContext<GalleryViewRuntime | null>(null)

const readGalleryActiveState = (
  state: ViewState | undefined
): ActiveGalleryViewState | undefined => readActiveTypedViewState(state, 'gallery')

const GalleryRuntimeProvider = (props: {
  active: ActiveGalleryViewState
  extra: GalleryState
  children?: ReactNode
}) => {
  const runtime = useGalleryRuntime({
    active: props.active,
    extra: props.extra
  })

  return createElement(Ctx.Provider, { value: runtime }, props.children)
}

export const GalleryView = (_props: GalleryViewProps) => {
  const active = useDataViewValue(
    dataView => dataView.engine.active.state,
    readGalleryActiveState
  )
  const extra = useDataViewValue(
    dataView => dataView.engine.active.gallery.state
  )
  if (!active || !extra) {
    return null
  }

  return (
    <GalleryRuntimeProvider
      active={active}
      extra={extra}
    >
      <Grid />
    </GalleryRuntimeProvider>
  )
}

export const useGalleryRuntimeContext = (): GalleryViewRuntime => {
  const value = useContext(Ctx)
  if (!value) {
    throw new Error('Missing GalleryView.')
  }
  return value
}
