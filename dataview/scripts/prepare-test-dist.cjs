const {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} = require('node:fs')
const { dirname, join, relative, sep } = require('node:path')

const buildDir = join(process.cwd(), '.tmp', 'group-test-build')
const outDir = join(process.cwd(), '.tmp', 'group-test-dist')
const dataviewBuildDir = join(buildDir, 'dataview', 'src')
const uiBuildDir = join(buildDir, 'ui', 'src')
const uiOutDir = join(outDir, '__ui__')

const toPosixPath = value => value.split(sep).join('/')

const toRelativeRequirePath = (filePath, absoluteTarget) => {
  let nextTarget = relative(dirname(filePath), absoluteTarget)
  nextTarget = toPosixPath(nextTarget)
  if (!nextTarget.startsWith('.')) {
    nextTarget = `./${nextTarget}`
  }
  return nextTarget
}

const rewriteAliasRequires = filePath => {
  const content = readFileSync(filePath, 'utf8')
  const nextContent = content
    .replace(/require\((['"])@dataview(?:\/([^'"]+))?\1\)/g, (_match, quote, target) => {
      const absoluteTarget = target
        ? join(outDir, target)
        : join(outDir, 'index.js')
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
    })
    .replace(/require\((['"])@ui(?:\/([^'"]+))?\1\)/g, (_match, quote, target) => {
      const absoluteTarget = target
        ? join(uiOutDir, target)
        : join(uiOutDir, 'index.js')
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
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

rmSync(outDir, { recursive: true, force: true })
cpSync(dataviewBuildDir, outDir, { recursive: true })
cpSync(uiBuildDir, uiOutDir, { recursive: true })
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
rewriteDirectory(outDir)
