import type {
  GalleryModel
} from '@dataview/runtime/model/gallery/types'
import type {
  KanbanModel
} from '@dataview/runtime/model/kanban/types'
import type {
  PageModel
} from '@dataview/runtime/model/page/types'
import type {
  TableModel
} from '@dataview/runtime/model/table'

export interface DataViewModel {
  page: PageModel
  table: TableModel
  gallery: GalleryModel
  kanban: KanbanModel
}
