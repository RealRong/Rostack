const plugin = require('tailwindcss/plugin')

/** @type {import('tailwindcss').Config} */
const alphaColor = variable => `rgb(from var(${variable}) r g b / calc(alpha * <alpha-value>))`

const optionColors = [
  'default',
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red'
]

const borderUtilities = {
  '.border-default': {
    borderColor: 'var(--ui-border-default)'
  },
  '.border-muted': {
    borderColor: 'var(--ui-border-muted)'
  },
  '.border-strong': {
    borderColor: 'var(--ui-border-strong)'
  },
  '.border-divider': {
    borderColor: 'var(--ui-divider)'
  },
  '.border-divider-strong': {
    borderColor: 'var(--ui-divider-strong)'
  },
  '.border-floating': {
    borderColor: 'var(--ui-floating-border)'
  },
  '.border-accent-divider': {
    borderColor: 'var(--ui-accent-divider)'
  },
  '.border-accent-frame': {
    borderColor: 'var(--ui-accent-frame-border)'
  },
  '.text-accent': {
    color: 'var(--ui-accent-text)'
  },
  '.bg-overlay': {
    backgroundColor: 'var(--ui-overlay-bg)'
  }
}

const optionUtilities = Object.fromEntries(
  optionColors.flatMap(color => ([
    [
      `.bg-${color}`,
      { backgroundColor: `var(--ui-${color}-bg-strong)` }
    ],
    [
      `.bg-${color}-muted`,
      { backgroundColor: `var(--ui-${color}-bg-muted)` }
    ],
    [
      `.bg-${color}-soft`,
      { backgroundColor: `var(--ui-${color}-bg-soft)` }
    ],
    [
      `.text-${color}`,
      { color: `var(--ui-${color}-text)` }
    ],
    [
      `.text-${color}-muted`,
      { color: `var(--ui-${color}-text-muted)` }
    ],
    [
      `.border-option-${color}`,
      { borderColor: `var(--ui-${color}-border)` }
    ]
  ]))
)

module.exports = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      borderRadius: {
        lg: 'var(--control-radius)',
        md: 'calc(var(--control-radius) - 2px)',
        sm: 'calc(var(--control-radius) - 4px)'
      },
      boxShadow: {
        sm: 'var(--ui-shadow-sm)',
        popover: 'var(--ui-popover-shadow)'
      },
      colors: {
        border: alphaColor('--border'),
        input: alphaColor('--input'),
        ring: alphaColor('--ring'),
        background: alphaColor('--background'),
        foreground: alphaColor('--foreground'),
        fg: alphaColor('--ui-text-primary'),
        'fg-muted': alphaColor('--ui-text-secondary'),
        'fg-tertiary': alphaColor('--ui-text-tertiary'),
        'fg-disabled': alphaColor('--ui-text-disabled'),
        surface: alphaColor('--ui-surface'),
        'surface-muted': alphaColor('--ui-surface-muted'),
        'surface-subtle': alphaColor('--ui-surface-subtle'),
        'surface-strong': alphaColor('--ui-surface-strong'),
        hover: alphaColor('--ui-control-hover'),
        pressed: alphaColor('--ui-control-pressed'),
        overlay: alphaColor('--ui-overlay-bg'),
        'overlay-subtle': alphaColor('--ui-overlay-subtle'),
        'overlay-strong': alphaColor('--ui-overlay-strong'),
        floating: alphaColor('--ui-floating-bg'),
        field: alphaColor('--ui-field-bg'),
        'field-embedded': alphaColor('--ui-field-embedded-bg'),
        'accent-overlay': alphaColor('--ui-accent-overlay'),
        'accent-overlay-subtle': alphaColor('--ui-accent-overlay-subtle'),
        'accent-tint': alphaColor('--ui-accent-tint-subtle'),
        'accent-text': alphaColor('--ui-accent-text'),
        primary: {
          DEFAULT: alphaColor('--primary'),
          foreground: alphaColor('--primary-foreground')
        },
        secondary: {
          DEFAULT: alphaColor('--secondary'),
          foreground: alphaColor('--secondary-foreground')
        },
        destructive: {
          DEFAULT: alphaColor('--destructive'),
          foreground: alphaColor('--destructive-foreground')
        },
        muted: {
          DEFAULT: alphaColor('--muted'),
          foreground: alphaColor('--muted-foreground')
        },
        accent: {
          DEFAULT: alphaColor('--accent'),
          foreground: alphaColor('--accent-foreground')
        },
        card: {
          DEFAULT: alphaColor('--card'),
          foreground: alphaColor('--card-foreground')
        },
        popover: {
          DEFAULT: alphaColor('--popover'),
          foreground: alphaColor('--popover-foreground')
        }
      }
    }
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities({
        ...borderUtilities,
        ...optionUtilities
      })
    })
  ]
}
