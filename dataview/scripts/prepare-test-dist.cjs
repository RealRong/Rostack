const { mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } = require('node:fs')
const { dirname, join, relative, sep } = require('node:path')

const outDir = join(process.cwd(), '.tmp', 'group-test-dist')

const toPosixPath = value => value.split(sep).join('/')

const rewriteAliasRequires = filePath => {
  const content = readFileSync(filePath, 'utf8')
  const nextContent = content.replace(/require\((['"])@\/([^'"]+)\1\)/g, (_match, quote, target) => {
    const absoluteTarget = join(outDir, target)
    let nextTarget = relative(dirname(filePath), absoluteTarget)
    nextTarget = toPosixPath(nextTarget)
    if (!nextTarget.startsWith('.')) {
      nextTarget = `./${nextTarget}`
    }
    return `require(${quote}${nextTarget}${quote})`
  })

  if (nextContent !== content) {
    writeFileSync(filePath, nextContent)
  }
}

const rewriteDirectory = directory => {
  readdirSync(directory).forEach(entry => {
    const filePath = join(directory, entry)
    const stats = statSync(filePath)

    if (stats.isDirectory()) {
      rewriteDirectory(filePath)
      return
    }

    if (filePath.endsWith('.js')) {
      rewriteAliasRequires(filePath)
    }
  })
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
rewriteDirectory(outDir)
