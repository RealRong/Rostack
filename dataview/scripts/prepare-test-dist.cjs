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
const ts = require('typescript')

const buildDir = join(process.cwd(), '.tmp', 'group-test-build')
const outDir = join(process.cwd(), '.tmp', 'group-test-dist')
const dataviewBuildDir = join(buildDir, 'dataview', 'src')
const sharedSourceDir = join(process.cwd(), '..', 'shared')
const uiBuildDir = join(buildDir, 'ui', 'src')
const sharedOutDir = join(outDir, '__shared__')
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
    .replace(/require\((['"])@shared(?:\/([^'"]+))?\1\)/g, (_match, quote, target) => {
      const absoluteTarget = target
        ? join(sharedOutDir, target, 'src', 'index.js')
        : join(sharedOutDir, 'index.js')
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
    })
    .replace(/require\((['"])(\.{1,2}\/[^'"]+)\.tsx?\1\)/g, (_match, quote, target) => (
      `require(${quote}${target}.js${quote})`
    ))

  if (nextContent !== content) {
    writeFileSync(filePath, nextContent)
  }
}

const transpileSharedSource = (sourceRoot, outRoot) => {
  readdirSync(sourceRoot).forEach(entry => {
    const sourcePath = join(sourceRoot, entry)
    const stats = statSync(sourcePath)

    if (stats.isDirectory()) {
      if (entry === 'node_modules') {
        return
      }

      transpileSharedSource(sourcePath, join(outRoot, entry))
      return
    }

    if (
      (!sourcePath.endsWith('.ts') && !sourcePath.endsWith('.tsx'))
      || sourcePath.endsWith('.d.ts')
      || sourcePath.endsWith('.d.tsx')
    ) {
      return
    }

    const outputPath = join(
      outRoot,
      entry.replace(/\.tsx?$/, '.js')
    )
    const content = readFileSync(sourcePath, 'utf8')
    const transpiled = ts.transpileModule(content, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX
      },
      fileName: sourcePath
    })

    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, transpiled.outputText)
  })
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
transpileSharedSource(sharedSourceDir, sharedOutDir)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
rewriteDirectory(outDir)
