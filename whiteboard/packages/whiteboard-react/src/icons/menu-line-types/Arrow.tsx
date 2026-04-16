import type { ComponentProps } from 'react'

export type MenuLineTypeIconProps = ComponentProps<'svg'>

export const Arrow = ({
  ...props
}: MenuLineTypeIconProps) => (
  <svg
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    {...props}
  >
    <path
      d="m22.5 9.5-13 13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M22.457 8.234a1 1 0 0 1 1.174 1.18l-.761 3.76a1 1 0 0 1-1.688.508l-3.014-3.014a1 1 0 0 1 .513-1.688l3.776-.746Z"
      fill="currentColor"
    />
  </svg>
)

export default Arrow
