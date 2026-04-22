import type {
  DataViewGalleryModel
} from '@dataview/runtime/model/gallery/types'
import type {
  DataViewKanbanModel
} from '@dataview/runtime/model/kanban/types'
import type {
  PageModel
} from '@dataview/runtime/model/page/types'

export interface DataViewModel {
  page: PageModel
  gallery: DataViewGalleryModel
  kanban: DataViewKanbanModel
}
