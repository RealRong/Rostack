import { EDGE_LABEL_LINE_HEIGHT } from '@whiteboard/core/edge'
import type {
  TextMetrics,
  TextMetricsResource,
  TextMetricsSpec,
  TextTypographyProfile
} from '@whiteboard/editor/types/layout'

const TEXT_DEFAULT_LINE_HEIGHT_RATIO = 1.4
const TEXT_MEASURE_EMPTY_CONTENT = ' '
const TEXT_METRICS_FALLBACK_FONT_FAMILY = 'sans-serif'

const readTextMetricsKey = (
  spec: TextMetricsSpec
) => [
  spec.profile,
  spec.text,
  spec.placeholder,
  spec.fontSize,
  spec.fontWeight ?? '',
  spec.fontStyle ?? ''
].join('\u0001')

const normalizeTextMetricsSpec = (
  spec: TextMetricsSpec
): TextMetricsSpec => ({
  ...spec,
  text: spec.text ?? '',
  placeholder: spec.placeholder || TEXT_MEASURE_EMPTY_CONTENT,
  fontSize: Math.max(1, Math.ceil(spec.fontSize))
})

const readTextMetricsContent = (
  spec: TextMetricsSpec
) => spec.text || spec.placeholder || TEXT_MEASURE_EMPTY_CONTENT

const readTextMetricsLineHeight = (
  profile: TextTypographyProfile
) => profile === 'edge-label'
  ? EDGE_LABEL_LINE_HEIGHT
  : TEXT_DEFAULT_LINE_HEIGHT_RATIO

const createMeasureCanvasContext = () => {
  if (typeof OffscreenCanvas !== 'undefined') {
    const context = new OffscreenCanvas(1, 1).getContext('2d')
    if (context) {
      return context
    }
  }

  if (typeof document !== 'undefined') {
    const context = document.createElement('canvas').getContext('2d')
    if (context) {
      return context
    }
  }

  return undefined
}

const readMeasureFontFamily = () => {
  if (
    typeof window !== 'undefined'
    && typeof document !== 'undefined'
    && document.body
  ) {
    const value = window.getComputedStyle(document.body).fontFamily
    if (value) {
      return value
    }
  }

  return TEXT_METRICS_FALLBACK_FONT_FAMILY
}

const measureCanvasText = ({
  spec,
  context,
  fontFamily
}: {
  spec: TextMetricsSpec
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | undefined
  fontFamily: string
}): TextMetrics | undefined => {
  if (!context) {
    return undefined
  }

  context.font = [
    spec.fontStyle ?? 'normal',
    'normal',
    `${spec.fontWeight ?? 400}`,
    `${spec.fontSize}px`,
    fontFamily
  ].join(' ')

  return {
    width: Math.max(
      1,
      Math.ceil(context.measureText(
        readTextMetricsContent(spec)
      ).width)
    ),
    height: Math.max(
      1,
      Math.ceil(spec.fontSize * readTextMetricsLineHeight(spec.profile))
    )
  }
}

const fallbackMeasureText = (
  spec: TextMetricsSpec
): TextMetrics => ({
    width: Math.max(
      1,
      Math.ceil(readTextMetricsContent(spec).length * spec.fontSize * 0.6)
    ),
    height: Math.max(
      1,
      Math.ceil(spec.fontSize * readTextMetricsLineHeight(spec.profile))
    )
  })

export const createTextMetricsResource = (): TextMetricsResource => {
  const cache = new Map<string, TextMetrics>()
  const measureTextContext = createMeasureCanvasContext()
  const measureFontFamily = readMeasureFontFamily()

  const measure: TextMetricsResource['measure'] = (spec) => {
    const normalized = normalizeTextMetricsSpec(spec)
    const key = readTextMetricsKey(normalized)
    const cached = cache.get(key)
    if (cached) {
      return cached
    }

    const measured = measureCanvasText({
      spec: normalized,
      context: measureTextContext,
      fontFamily: measureFontFamily
    }) ?? fallbackMeasureText(normalized)

    cache.set(key, measured)
    return measured
  }

  return {
    measure,
    prime: (specs) => {
      const deduped = new Map<string, TextMetricsSpec>()
      for (let index = 0; index < specs.length; index += 1) {
        const normalized = normalizeTextMetricsSpec(specs[index]!)
        const key = readTextMetricsKey(normalized)
        if (!cache.has(key) && !deduped.has(key)) {
          deduped.set(key, normalized)
        }
      }

      deduped.forEach((spec) => {
        measure(spec)
      })
    },
    clear: () => {
      cache.clear()
    }
  }
}
