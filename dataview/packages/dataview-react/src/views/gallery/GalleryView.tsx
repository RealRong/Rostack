import { Grid } from '#dataview-react/views/gallery/components/Grid'
import { GalleryProvider } from '#dataview-react/views/gallery/context'

export interface GalleryViewProps {}

export const GalleryView = (_props: GalleryViewProps) => {
  return (
    <GalleryProvider>
      <Grid />
    </GalleryProvider>
  )
}
