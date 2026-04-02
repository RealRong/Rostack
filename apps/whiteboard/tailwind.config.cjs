const path = require('node:path')

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('../../ui/tailwind/preset.cjs')],
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
    path.join(__dirname, '../../whiteboard/packages/whiteboard-react/src/**/*.{ts,tsx}'),
    path.join(__dirname, '../../ui/src/**/*.{ts,tsx}')
  ]
}
