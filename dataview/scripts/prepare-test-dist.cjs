const {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} = require('node:fs')
const { dirname, join, relative, sep } = require('node:path')
const ts = require('typescript')

const outDir = join(process.cwd(), '.tmp', 'group-test-dist')
const dataviewSourceDir = join(process.cwd(), 'src')
const sharedSourceDir = join(process.cwd(), '..', 'shared')
const uiSourceDir = join(process.cwd(), '..', 'ui', 'src')
const sharedOutDir = join(outDir, '__shared__')
const uiOutDir = join(outDir, '__ui__')

const DATAVIEW_PACKAGE_DIRS = {
  core: join(outDir, 'core'),
  engine: join(outDir, 'engine'),
  meta: join(outDir, 'meta'),
  react: join(outDir, 'react'),
  table: join(outDir, 'table')
}

const SHARED_PACKAGE_DIRS = {
  core: join(sharedOutDir, 'core', 'src'),
  dom: join(sharedOutDir, 'dom', 'src'),
  react: join(sharedOutDir, 'react', 'src')
}

const toPosixPath = value => value.split(sep).join('/')

const toRelativeRequirePath = (filePath, absoluteTarget) => {
  let nextTarget = relative(dirname(filePath), absoluteTarget)
  nextTarget = toPosixPath(nextTarget)
  if (!nextTarget.startsWith('.')) {
    nextTarget = `./${nextTarget}`
  }
  return nextTarget
}

const transpileTree = (sourceRoot, outRoot) => {
  readdirSync(sourceRoot).forEach(entry => {
    const sourcePath = join(sourceRoot, entry)
    const stats = statSync(sourcePath)

    if (stats.isDirectory()) {
      if (entry === 'node_modules') {
        return
      }

      transpileTree(sourcePath, join(outRoot, entry))
      return
    }

    if (
      (!sourcePath.endsWith('.ts') && !sourcePath.endsWith('.tsx'))
      || sourcePath.endsWith('.d.ts')
      || sourcePath.endsWith('.d.tsx')
    ) {
      return
    }

    const outputPath = join(outRoot, entry.replace(/\.tsx?$/, '.js'))
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

const resolveOutputModule = (baseDir, target) => {
  const nextTarget = target ?? 'index'
  const candidates = [
    join(baseDir, `${nextTarget}.js`),
    join(baseDir, nextTarget, 'index.js')
  ]

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return candidate
      }
    } catch {}
  }

  return candidates[0]
}

const rewritePackageRequires = filePath => {
  const content = readFileSync(filePath, 'utf8')
  const nextContent = content
    .replace(/require\((['"])@dataview\/(core|engine|meta|react|table)(?:\/([^'"]+))?\1\)/g, (_match, quote, pkg, target) => {
      const absoluteTarget = resolveOutputModule(DATAVIEW_PACKAGE_DIRS[pkg], target)
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
    })
    .replace(/require\((['"])#(core|react)(?:\/([^'"]+))?\1\)/g, (_match, quote, pkg, target) => {
      const absoluteTarget = resolveOutputModule(DATAVIEW_PACKAGE_DIRS[pkg], target)
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
    })
    .replace(/require\((['"])@shared\/ui(?:\/([^'"]+))?\1\)/g, (_match, quote, target) => {
      const absoluteTarget = resolveOutputModule(uiOutDir, target)
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
    })
    .replace(/require\((['"])@shared\/(core|dom|react)(?:\/([^'"]+))?\1\)/g, (_match, quote, pkg, target) => {
      const absoluteTarget = resolveOutputModule(SHARED_PACKAGE_DIRS[pkg], target)
      return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
    })
    .replace(/require\((['"])(\.{1,2}\/[^'"]+)\.tsx?\1\)/g, (_match, quote, target) => {
      return `require(${quote}${target}.js${quote})`
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
      rewritePackageRequires(filePath)
    }
  })
}

rmSync(outDir, { recursive: true, force: true })
transpileTree(dataviewSourceDir, outDir)
transpileTree(uiSourceDir, uiOutDir)
transpileTree(sharedSourceDir, sharedOutDir)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
rewriteDirectory(outDir)
