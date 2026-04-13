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

const workspaceDir = process.cwd()
const outDir = join(workspaceDir, '.tmp', 'group-test-dist')
const sharedDir = join(workspaceDir, '..', 'shared')
const sharedOutDir = join(outDir, '__shared__')
const uiOutDir = join(outDir, '__ui__')

const DATAVIEW_SOURCE_DIRS = {
  core: join(workspaceDir, 'packages', 'dataview-core', 'src'),
  engine: join(workspaceDir, 'packages', 'dataview-engine', 'src'),
  meta: join(workspaceDir, 'packages', 'dataview-meta', 'src'),
  react: join(workspaceDir, 'packages', 'dataview-react', 'src'),
  table: join(workspaceDir, 'packages', 'dataview-table', 'src')
}

const DATAVIEW_PACKAGE_DIRS = {
  core: join(outDir, 'core'),
  engine: join(outDir, 'engine'),
  meta: join(outDir, 'meta'),
  react: join(outDir, 'react'),
  table: join(outDir, 'table')
}

const SHARED_SOURCE_DIRS = {
  core: join(sharedDir, 'core', 'src'),
  dom: join(sharedDir, 'dom', 'src'),
  react: join(sharedDir, 'react', 'src')
}

const SHARED_PACKAGE_DIRS = {
  core: join(sharedOutDir, 'core'),
  dom: join(sharedOutDir, 'dom'),
  react: join(sharedOutDir, 'react')
}

const INTERNAL_PACKAGE_DIRS = {
  ...DATAVIEW_PACKAGE_DIRS,
  ui: uiOutDir
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

const transpilePackageTrees = packageDirs => {
  Object.entries(packageDirs).forEach(([pkg, sourceDir]) => {
    transpileTree(sourceDir, DATAVIEW_PACKAGE_DIRS[pkg])
  })
}

const transpileSharedTrees = packageDirs => {
  Object.entries(packageDirs).forEach(([pkg, sourceDir]) => {
    transpileTree(sourceDir, SHARED_PACKAGE_DIRS[pkg])
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

const replacePackageRequires = (content, filePath, pattern, resolveTarget) => {
  return content.replace(pattern, (_match, quote, pkg, target) => {
    const absoluteTarget = resolveTarget(pkg, target)
    return `require(${quote}${toRelativeRequirePath(filePath, absoluteTarget)}${quote})`
  })
}

const rewritePackageRequires = filePath => {
  const content = readFileSync(filePath, 'utf8')
  let nextContent = content

  nextContent = replacePackageRequires(
    nextContent,
    filePath,
    /require\((['"])@dataview\/(core|engine|meta|react|table)(?:\/([^'"]+))?\1\)/g,
    (pkg, target) => resolveOutputModule(DATAVIEW_PACKAGE_DIRS[pkg], target)
  )

  nextContent = replacePackageRequires(
    nextContent,
    filePath,
    /require\((['"])#(core|engine|meta|react|table|ui)(?:\/([^'"]+))?\1\)/g,
    (pkg, target) => resolveOutputModule(INTERNAL_PACKAGE_DIRS[pkg], target)
  )

  nextContent = replacePackageRequires(
    nextContent,
    filePath,
    /require\((['"])@shared\/(ui)(?:\/([^'"]+))?\1\)/g,
    (_pkg, target) => resolveOutputModule(uiOutDir, target)
  )

  nextContent = replacePackageRequires(
    nextContent,
    filePath,
    /require\((['"])@shared\/(core|dom|react)(?:\/([^'"]+))?\1\)/g,
    (pkg, target) => resolveOutputModule(SHARED_PACKAGE_DIRS[pkg], target)
  )

  nextContent = nextContent.replace(/require\((['"])(\.{1,2}\/[^'"]+)\.tsx?\1\)/g, (_match, quote, target) => {
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
transpilePackageTrees(DATAVIEW_SOURCE_DIRS)
transpileTree(join(sharedDir, 'ui', 'src'), uiOutDir)
transpileSharedTrees(SHARED_SOURCE_DIRS)
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
rewriteDirectory(outDir)
