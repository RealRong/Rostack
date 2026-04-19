import type {
  DataViewGalleryModel
} from '@dataview/runtime/model/gallery/types'
import type {
  DataViewKanbanModel
} from '@dataview/runtime/model/kanban/types'
import type {
  PageModel
} from '@dataview/runtime/model/page/types'
import type {
  DataViewTableModel
} from '@dataview/runtime/model/table/types'

export interface DataViewModel {
  page: PageModel
  table: DataViewTableModel
  gallery: DataViewGalleryModel
  kanban: DataViewKanbanModel
}
