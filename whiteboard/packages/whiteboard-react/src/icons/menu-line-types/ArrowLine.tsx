import type { ComponentProps } from 'react'

export type MenuLineTypeIconProps = ComponentProps<'svg'>

export const ArrowLine = ({
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
  </svg>
)

export default ArrowLine
