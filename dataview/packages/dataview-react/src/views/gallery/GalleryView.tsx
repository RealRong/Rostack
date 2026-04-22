import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from 'react'
import {
  useDataViewValue
} from '@dataview/react/dataview'
import { Grid } from '@dataview/react/views/gallery/components/Grid'
import {
  useGalleryRuntime
} from '@dataview/react/views/gallery/runtime'
import type {
  GalleryViewRuntime
} from '@dataview/react/views/gallery/types'

export interface GalleryViewProps {}

const Ctx = createContext<GalleryViewRuntime | null>(null)

const GalleryRuntimeProvider = (props: {
  children?: ReactNode
}) => {
  const runtime = useGalleryRuntime()

  return createElement(Ctx.Provider, { value: runtime }, props.children)
}

export const GalleryView = (_props: GalleryViewProps) => {
  const body = useDataViewValue(
    dataView => dataView.model.gallery.body
  )
  if (!body) {
    return null
  }

  return (
    <GalleryRuntimeProvider>
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
