import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type {
  GroupProperty,
  GroupRecord
} from '@dataview/core/contracts'
import {
  isEmptyPropertyValue
} from '@dataview/core/property'
import {
  useDataView
} from '@dataview/react/dataview'
import {
  PropertyValueContent
} from '@dataview/react/properties/value'
import { CardTitle } from '@dataview/react/views/shared'
import { cn } from '@ui/utils'
import { FileText } from 'lucide-react'
import { useGalleryContext } from '../context'
import {
  CARD_TITLE_PLACEHOLDER,
  readCardTitleText
} from '@dataview/react/views/shared/cardTitleValue'

const PreviewSurface = (props: {
  appearanceId: string
  record: GroupRecord
  titleProperty?: GroupProperty
  properties: readonly GroupProperty[]
  dragCount: number
}) => {
  const titleText = readCardTitleText(props.titleProperty, props.record)
  const visibleProperties = props.properties.filter(property => (
    !isEmptyPropertyValue(props.record.values[property.id])
  ))

  return (
    <div className="relative h-full rounded-lg p-3 transition-colors ui-shadow-sm ui-card-bg shadow-lg">
      {props.dragCount > 1 ? (
        <span className="absolute right-3 top-3 inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
          {props.dragCount}
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="flex min-w-0 items-start gap-2.5 pb-2">
          <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" size={18} strokeWidth={1.8} />
          <div className="min-w-0 flex-1">
            <CardTitle
              editing={false}
              text={titleText}
              placeholder={CARD_TITLE_PLACEHOLDER}
              textClassName="text-base font-semibold leading-6"
            />
          </div>
        </div>

        {visibleProperties.length ? (
          <div className="flex flex-col pb-2 pt-0 leading-6">
            {visibleProperties.map(property => (
              <div key={property.id} className="min-w-0 pb-2 last:pb-0">
                <PropertyValueContent
                  property={property}
                  value={props.record.values[property.id]}
                  className="text-[13px] leading-6 text-foreground"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const Overlay = () => {
  const controller = useGalleryContext()
  const engine = useDataView().engine
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const appearanceId = controller.drag.activeId
  const recordId = appearanceId
    ? controller.currentView.appearances.get(appearanceId)?.recordId
    : undefined
  const record = recordId
    ? engine.read.record.get(recordId)
    : undefined
  const pointer = controller.drag.pointerRef.current
  const offset = controller.drag.overlayOffsetRef.current

  useEffect(() => {
    if (!record || typeof window === 'undefined') {
      return
    }

    let frame = 0
    const update = () => {
      const nextPointer = controller.drag.pointerRef.current
      const nextOffset = controller.drag.overlayOffsetRef.current
      const node = overlayRef.current
      if (nextPointer && node) {
        node.style.transform = `translate3d(${Math.round(nextPointer.x - nextOffset.x)}px, ${Math.round(nextPointer.y - nextOffset.y)}px, 0)`
      }
      frame = window.requestAnimationFrame(update)
    }

    frame = window.requestAnimationFrame(update)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [controller.drag.overlayOffsetRef, controller.drag.pointerRef, record])

  if (!appearanceId || !record || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed left-0 top-0 z-[999]"
      style={{
        width: controller.drag.overlaySize.width,
        transform: pointer
          ? `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
          : 'translate3d(-9999px, -9999px, 0)'
      }}
    >
      <div className="relative">
        {controller.drag.dragIds.length > 1 ? (
          <>
            <div className="absolute inset-x-3 top-3 h-full rounded-3xl border bg-background/80 shadow-sm" />
            <div className="absolute inset-x-1.5 top-1.5 h-full rounded-3xl border bg-background/90 shadow-sm" />
          </>
        ) : null}
        <div className={cn(controller.drag.dragIds.length > 1 && 'relative')}>
          <PreviewSurface
            appearanceId={appearanceId}
            record={record}
            titleProperty={controller.titleProperty}
            properties={controller.properties}
            dragCount={controller.drag.dragIds.length}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}
