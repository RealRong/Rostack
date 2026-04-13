import { Grid } from './components/Grid'
import { GalleryProvider } from './context'

export interface GalleryViewProps {}

export const GalleryView = (_props: GalleryViewProps) => {
  return (
    <GalleryProvider>
      <Grid />
    </GalleryProvider>
  )
}
