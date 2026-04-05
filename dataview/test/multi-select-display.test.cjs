const test = require('node:test')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')

const {
  PropertyValueRenderer
} = require('../.tmp/group-test-dist/react/properties/value/PropertyValueRenderer.js')

test('multi-select value display renders option names instead of raw option ids', () => {
  const html = renderToStaticMarkup(React.createElement(PropertyValueRenderer, {
    property: {
      id: 'tags',
      name: 'Tags',
      kind: 'multiSelect',
      config: {
        type: 'multiSelect',
        options: [
          {
            id: 'option',
            key: 'option',
            name: 'Option'
          },
          {
            id: 'option_2',
            key: 'option_2',
            name: 'Option 2'
          }
        ]
      }
    },
    value: ['option', 'option_2']
  }))

  assert.ok(html.includes('Option'))
  assert.ok(html.includes('Option 2'))
  assert.equal(html.includes('option_2'), false)
})
