import type {
  DataViewGalleryModel
} from '@dataview/runtime/model/gallery/types'
import type {
  DataViewInlineRuntime
} from '@dataview/runtime/model/inline/types'
import type {
  DataViewKanbanModel
} from '@dataview/runtime/model/kanban/types'
import type {
  DataViewPageRuntime
} from '@dataview/runtime/model/page/types'
import type {
  DataViewTableModel
} from '@dataview/runtime/model/table/types'

export interface DataViewModel {
  page: DataViewPageRuntime
  inline: DataViewInlineRuntime
  table: DataViewTableModel
  gallery: DataViewGalleryModel
  kanban: DataViewKanbanModel
}
