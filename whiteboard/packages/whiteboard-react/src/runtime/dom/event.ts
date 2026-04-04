type ConsumableDomEvent = Pick<Event, 'cancelable' | 'preventDefault' | 'stopPropagation'>

export const consumeDomEvent = (
  event: ConsumableDomEvent
) => {
  if (event.cancelable) {
    event.preventDefault()
  }
  event.stopPropagation()
}
