import { Grid } from '#react/views/gallery/components/Grid'
import { GalleryProvider } from '#react/views/gallery/context'

export interface GalleryViewProps {}

export const GalleryView = (_props: GalleryViewProps) => {
  return (
    <GalleryProvider>
      <Grid />
    </GalleryProvider>
  )
}
