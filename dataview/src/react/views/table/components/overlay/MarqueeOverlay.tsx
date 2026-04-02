export interface MarqueeOverlayProps {
  box: {
    left: number
    top: number
    width: number
    height: number
  } | null
}

export const MarqueeOverlay = (props: MarqueeOverlayProps) => {
  if (!props.box) {
    return null
  }

  return (
    <div
      className="ui-accent-divider ui-accent-overlay pointer-events-none absolute z-20 rounded-md border"
      style={{
        left: props.box.left,
        top: props.box.top,
        width: props.box.width,
        height: props.box.height
      }}
    />
  )
}
