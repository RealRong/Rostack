import type { ComponentProps } from 'react'

export type MenuLineTypeIconProps = ComponentProps<'svg'>

export const ArrowFillet = ({
  ...props
}: MenuLineTypeIconProps) => (
  <svg
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    {...props}
  >
    <path
      d="M7.8 21.964h7.841c1.906 0 2.732-2.413 1.225-3.58l-4.832-3.745c-1.507-1.168-.681-3.581 1.225-3.581h6.23"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M23.457 10.212a1 1 0 0 1 0 1.732l-3.226 1.862a1 1 0 0 1-1.5-.866V9.215a1 1 0 0 1 1.5-.866l3.226 1.863Z"
      fill="currentColor"
    />
  </svg>
)

export default ArrowFillet
