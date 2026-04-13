const path = require('node:path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../../shared/ui/tailwind/preset.cjs')],
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
    path.join(__dirname, '../../dataview/packages/dataview-react/src/**/*.{ts,tsx}'),
    path.join(__dirname, '../../shared/ui/src/**/*.{ts,tsx}')
  ]
}
