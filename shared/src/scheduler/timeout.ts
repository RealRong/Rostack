export type TimeoutTask = {
  cancel: () => void
  isScheduled: () => boolean
  schedule: (delayMs: number) => void
}

export const createTimeoutTask = (
  flush: () => void
): TimeoutTask => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return {
    cancel: () => {
      if (timeoutId === null) {
        return
      }

      clearTimeout(timeoutId)
      timeoutId = null
    },
    isScheduled: () => timeoutId !== null,
    schedule: (delayMs) => {
      if (timeoutId !== null) {
        return
      }

      timeoutId = setTimeout(() => {
        timeoutId = null
        flush()
      }, Math.max(0, delayMs))
    }
  }
}
