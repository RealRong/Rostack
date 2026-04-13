import { Grid } from '#react/views/gallery/components/Grid.tsx'
import { GalleryProvider } from '#react/views/gallery/context.tsx'

export interface GalleryViewProps {}

export const GalleryView = (_props: GalleryViewProps) => {
  return (
    <GalleryProvider>
      <Grid />
    </GalleryProvider>
  )
}
