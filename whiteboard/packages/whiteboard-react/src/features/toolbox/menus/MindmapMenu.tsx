import { ChipColumn, MenuSection } from '../../selection/chrome/menus/MenuPrimitives'
import {
  MINDMAP_INSERT_PRESETS,
  MINDMAP_INSERT_TEMPLATES
} from '../presets'

const MindmapTemplatePreview = ({
  templateKey
}: {
  templateKey: string
}) => {
  const template = MINDMAP_INSERT_TEMPLATES.find((item) => item.key === templateKey)
  const children = template?.children ?? []

  return (
    <svg
      viewBox="0 0 72 48"
      aria-hidden="true"
      className="wb-left-toolbar-mindmap-preview"
    >
      <rect
        x="26"
        y="17"
        width="20"
        height="14"
        rx="7"
        className="wb-left-toolbar-mindmap-preview-node wb-left-toolbar-mindmap-preview-node-root"
      />
      {children.slice(0, 4).map((child, index) => {
        const left = child.side === 'left'
        const y = 8 + index * 10
        const targetX = left ? 8 : 52
        const lineStartX = left ? 26 : 46
        const lineEndX = left ? 20 : 52
        return (
          <g key={`${templateKey}:${index}`}>
            <path
              d={`M${lineStartX} 24 C${left ? 22 : 50} 24, ${left ? 18 : 54} ${y + 4}, ${lineEndX} ${y + 4}`}
              className="wb-left-toolbar-mindmap-preview-line"
            />
            <rect
              x={targetX}
              y={y}
              width="12"
              height="8"
              rx="4"
              className="wb-left-toolbar-mindmap-preview-node"
            />
          </g>
        )
      })}
    </svg>
  )
}

export const MindmapMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <MenuSection title="Mindmap">
    <ChipColumn>
      {MINDMAP_INSERT_PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          className="wb-left-toolbar-template"
          data-active={value === preset.key ? 'true' : undefined}
          onClick={() => onChange(preset.key)}
          data-selection-ignore
          data-input-ignore
        >
          <span className="wb-left-toolbar-template-preview">
            <MindmapTemplatePreview templateKey={preset.key} />
          </span>
          <span className="wb-left-toolbar-template-copy">
            <span className="wb-left-toolbar-template-title">{preset.label}</span>
            <span className="wb-left-toolbar-template-desc">{preset.description}</span>
          </span>
        </button>
      ))}
    </ChipColumn>
  </MenuSection>
)
