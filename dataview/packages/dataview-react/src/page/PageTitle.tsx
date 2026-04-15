import {
  ChevronDown,
  Database,
  LoaderCircle,
  Sparkles
} from 'lucide-react'
import {
  useCallback,
  useMemo,
  useState
} from 'react'
import { Button } from '@shared/ui/button'
import { Menu } from '@shared/ui/menu'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import {
  applyPerfPreset,
  PERF_PRESETS,
  buildPerfPresetMenuItems,
  formatPerfPresetCount,
  readPerfPresetMeta,
  type PerfPresetId
} from '@dataview/react/page/perfPresets'

const runNextFrame = (callback: () => void) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    callback()
    return
  }

  window.requestAnimationFrame(() => {
    callback()
  })
}

export interface PageTitleProps {}

export const PageTitle = (_props: PageTitleProps) => {
  const dataView = useDataView()
  const document = useDataViewValue(dataView => dataView.engine.select.document)
  const currentPreset = readPerfPresetMeta(document)
  const [busyPresetId, setBusyPresetId] = useState<PerfPresetId | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const busyLabel = busyPresetId
    ? PERF_PRESETS.find(preset => preset.id === busyPresetId)?.label
    : undefined

  const onSelectPreset = useCallback((presetId: PerfPresetId) => {
    if (busyPresetId) {
      return
    }

    setErrorMessage(null)
    setBusyPresetId(presetId)

    runNextFrame(() => {
      try {
        applyPerfPreset({
          engine: dataView.engine,
          presetId
        })
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : '生成预设数据时发生未知错误。'
        )
      } finally {
        setBusyPresetId(null)
      }
    })
  }, [busyPresetId, dataView.engine])

  const items = useMemo(() => buildPerfPresetMenuItems({
    currentPresetId: currentPreset?.id,
    busyPresetId,
    onSelect: onSelectPreset
  }), [busyPresetId, currentPreset?.id, onSelectPreset])

  const recordCount = document.records.order.length
  const fieldCount = document.fields.order.length + 1
  const viewCount = document.views.order.length
  const title = currentPreset?.label ?? 'DataView 场景预设'

  return (
    <section className="text-card-foreground my-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-3xl font-bold text-foreground">
            {title}
          </div>
          {errorMessage ? (
            <div className="mt-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}
        </div>
        <Menu.Dropdown
          items={items}
          initialFocus={0}
          mode="blocking"
          backdrop="transparent"
          size="lg"
          trigger={(
            <Button
              variant="outline"
              size="lg"
              disabled={Boolean(busyPresetId)}
              leading={busyPresetId
                ? <LoaderCircle className="size-4 animate-spin" size={16} strokeWidth={1.8} />
                : <Database className="size-4" size={16} strokeWidth={1.8} />}
              trailing={<ChevronDown className="size-4" size={16} strokeWidth={1.8} />}
              className="w-full min-w-[220px] justify-between md:w-auto"
            >
              {busyPresetId ? '正在生成预设…' : '加载场景预设'}
            </Button>
          )}
        />
      </div>
    </section>
  )
}
