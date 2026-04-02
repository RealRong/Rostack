const path = require('node:path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'main.tsx'),
    path.join(__dirname, '../src/react/**/*.{ts,tsx}')
  ],
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
      colors: {
        border: 'hsl(var(--ui-border-subtle))',
        input: 'hsl(var(--ui-border-subtle))',
        ring: 'hsl(var(--ui-focus-ring))',
        background: 'hsl(var(--ui-canvas))',
        foreground: 'hsl(var(--ui-text-primary))',
        primary: {
          DEFAULT: 'hsl(var(--ui-accent))',
          foreground: 'hsl(var(--ui-accent-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--ui-surface-muted))',
          foreground: 'hsl(var(--ui-text-primary))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--ui-danger))',
          foreground: 'hsl(var(--ui-danger-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--ui-surface-muted))',
          foreground: 'hsl(var(--ui-text-secondary))'
        },
        accent: {
          DEFAULT: 'hsl(var(--ui-surface-hover))',
          foreground: 'hsl(var(--ui-text-primary))'
        },
        card: {
          DEFAULT: 'hsl(var(--ui-surface))',
          foreground: 'hsl(var(--ui-text-primary))'
        },
        popover: {
          DEFAULT: 'hsl(var(--ui-surface))',
          foreground: 'hsl(var(--ui-text-primary))'
        }
      }
    }
  },
  plugins: []
}
