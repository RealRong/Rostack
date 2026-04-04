import { getDocumentViews } from '@dataview/core/document'
import {
  useDataView,
  useDocument
} from '@dataview/react/dataview'
import { renderMessage } from '@dataview/meta'
import type { CreateViewItem } from './catalog'

const createViewName = (
  baseName: string,
  existingNames: ReadonlySet<string>
) => {
  if (!existingNames.has(baseName)) {
    return baseName
  }

  for (let index = 2; index < Number.MAX_SAFE_INTEGER; index += 1) {
    const candidate = `${baseName} ${index}`
    if (!existingNames.has(candidate)) {
      return candidate
    }
  }

  return `${baseName} ${Date.now()}`
}

export const useCreateView = () => {
  const dataView = useDataView()
  const document = useDocument()
  const views = getDocumentViews(document)

  return (item: CreateViewItem) => {
    if (!item.enabled) {
      return undefined
    }

    const existingNames = new Set(views.map(view => view.name))
    const name = createViewName(renderMessage(item.label), existingNames)
    const viewId = dataView.engine.views.create({
      name,
      type: item.type
    })

    if (!viewId) {
      return undefined
    }

    dataView.page.setActiveViewId(viewId)
    return viewId
  }
}
