/** @type {import('tailwindcss').Config} */
const alphaColor = variable => `rgb(from var(${variable}) r g b / <alpha-value>)`

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
      colors: {
        border: alphaColor('--border'),
        input: alphaColor('--input'),
        ring: alphaColor('--ring'),
        background: alphaColor('--background'),
        foreground: alphaColor('--foreground'),
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
  plugins: []
}
