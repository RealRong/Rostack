import { useEffect, type RefObject } from 'react'
import { observeElementSize } from '@shared/dom'
import { createRafTask } from '@shared/core'
import type { WhiteboardRuntime as Editor } from '@whiteboard/react/types/runtime'
import { resolveWheelInput } from '@whiteboard/react/dom/host/input'

type ContainerRect = Parameters<Editor['actions']['viewport']['setRect']>[0]
type WheelInput = Parameters<Editor['actions']['interaction']['wheel']>[0]

type ViewportInputOptions = {
  wheelEnabled: boolean
  wheelSensitivity: number
}

const applyWheelSensitivity = (
  input: WheelInput,
  wheelSensitivity: number
): WheelInput => {
  if (!input.modifiers.ctrl && !input.modifiers.meta) {
    return input
  }

  return {
    ...input,
    deltaY: input.deltaY * wheelSensitivity
  }
}

const isTextInputElement = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false
  if (target.closest('textarea,select,[contenteditable]:not([contenteditable="false"])')) {
    return true
  }
  if (!(target instanceof HTMLInputElement)) return false
  const type = (target.type || 'text').toLowerCase()
  return (
    type === 'text'
    || type === 'search'
    || type === 'email'
    || type === 'url'
    || type === 'tel'
    || type === 'password'
    || type === 'number'
    || type === 'date'
    || type === 'datetime-local'
    || type === 'month'
    || type === 'time'
    || type === 'week'
  )
}

const readContainerRect = (
  element: HTMLDivElement
): ContainerRect => {
  const rect = element.getBoundingClientRect()
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  }
}

export const useBindViewportInput = ({
  editor,
  containerRef,
  options
}: {
  editor: Editor
  containerRef: RefObject<HTMLDivElement | null>
  options: ViewportInputOptions
}) => {
  useEffect(() => {
    const element = containerRef.current
    if (!element) {
      return
    }
    let pendingWheelInput: WheelInput | null = null

    const refreshContainerRect = () => {
      editor.actions.viewport.setRect(readContainerRect(element))
    }

    refreshContainerRect()

    const clearWheelFrame = () => {
      pendingWheelInput = null
      wheelTask.cancel()
    }

    const flushWheel = () => {
      const input = pendingWheelInput
      if (!input) {
        return
      }

      pendingWheelInput = null
      if (!options.wheelEnabled) {
        return
      }

      refreshContainerRect()
      editor.actions.interaction.wheel(input)
    }
    const wheelTask = createRafTask(flushWheel)

    const scheduleWheel = (
      input: WheelInput,
      wheelSensitivity: number
    ) => {
      const nextInput = applyWheelSensitivity(input, wheelSensitivity)

      if (pendingWheelInput) {
        pendingWheelInput.deltaX += nextInput.deltaX
        pendingWheelInput.deltaY += nextInput.deltaY
        pendingWheelInput.client = nextInput.client
        pendingWheelInput.screen = nextInput.screen
        pendingWheelInput.world = nextInput.world
        pendingWheelInput.modifiers.alt = pendingWheelInput.modifiers.alt || nextInput.modifiers.alt
        pendingWheelInput.modifiers.shift = pendingWheelInput.modifiers.shift || nextInput.modifiers.shift
        pendingWheelInput.modifiers.ctrl = pendingWheelInput.modifiers.ctrl || nextInput.modifiers.ctrl
        pendingWheelInput.modifiers.meta = pendingWheelInput.modifiers.meta || nextInput.modifiers.meta
      } else {
        pendingWheelInput = {
          ...nextInput,
          modifiers: {
            ...nextInput.modifiers
          }
        }
      }

      wheelTask.schedule()
    }

    const onWheel = (event: WheelEvent) => {
      if (!options.wheelEnabled) return
      if (isTextInputElement(event.target)) return

      refreshContainerRect()
      scheduleWheel(resolveWheelInput({
        editor,
        event
      }), options.wheelSensitivity)

      if (event.cancelable) {
        event.preventDefault()
      }
      event.stopPropagation()
    }

    const onBlur = () => {
      clearWheelFrame()
    }

    const stopObserving = observeElementSize(element, {
      emitInitial: false,
      onChange: () => {
        refreshContainerRect()
      }
    })

    element.addEventListener('wheel', onWheel, { passive: false })
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur)
    }

    return () => {
      element.removeEventListener('wheel', onWheel)
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur)
      }
      stopObserving()
      clearWheelFrame()
    }
  }, [containerRef, editor, options])
}
