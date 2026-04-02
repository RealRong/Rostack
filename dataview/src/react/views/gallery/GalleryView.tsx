import type { ViewId } from '@/core/contracts'
import { Grid } from './components/Grid'
import { GalleryProvider } from './context'

export interface GalleryViewProps {
  viewId: ViewId
}

export const GalleryView = (props: GalleryViewProps) => {
  return (
    <GalleryProvider
      viewId={props.viewId}
    >
      <Grid />
    </GalleryProvider>
  )
}
