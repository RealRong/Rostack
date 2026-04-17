import type { LayoutBackend, LayoutRequest } from '@whiteboard/editor'
import { measureFitFontSize } from '@whiteboard/react/features/node/dom/textFit'
import { measureTextOuterSize } from '@whiteboard/react/features/node/dom/textMeasure'
import type { TextSourceStore } from '@whiteboard/react/features/node/dom/textSourceStore'

const readSource = (
  textSources: TextSourceStore,
  sourceId: LayoutRequest['sourceId']
) => {
  const source = textSources.get(sourceId)
  return source?.isConnected
    ? source
    : undefined
}

export const createLayoutBackend = ({
  textSources
}: {
  textSources: TextSourceStore
}): LayoutBackend => ({
  measure: (request) => {
    const source = readSource(textSources, request.sourceId)
    if (!source) {
      return undefined
    }

    if (request.kind === 'size') {
      const size = measureTextOuterSize({
        content: request.text,
        placeholder: request.placeholder,
        source,
        fontSize: request.fontSize,
        fontStyle: request.fontStyle,
        fontWeight: request.fontWeight,
        widthMode: request.widthMode,
        wrapWidth: request.wrapWidth,
        frame: request.frame
      })

      return size
        ? {
            kind: 'size',
            size
          }
        : undefined
    }

    return {
      kind: 'fit',
      fontSize: measureFitFontSize({
        text: request.text,
        box: request.box,
        source,
        minFontSize: request.minFontSize,
        maxFontSize: request.maxFontSize,
        textAlign: request.textAlign
      })
    }
  }
})
