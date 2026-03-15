import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { downloadTemplate } from '@bluwy/giget-core'
import * as p from '@clack/prompts'
import { type Command, command } from 'cleye'

const __dirname = dirname(fileURLToPath(import.meta.url))

const possibleTemplates = ['app', 'cli'] as const
type Templates = (typeof possibleTemplates)[number]

const Template = (template: Templates) => {
  if (!possibleTemplates.includes(template)) {
    throw new Error(
      `Invalid template: "${template}" (must be one of ${possibleTemplates.join(', ')})`,
    )
  }
  return template
}

interface PkgInfo {
  name: string
  version: string
}

function pkgFromUserAgent(userAgent: string | undefined): PkgInfo | undefined {
  if (!userAgent) return undefined
  const pkgSpec = userAgent.split(' ')[0]
  const pkgSpecArr = pkgSpec.split('/')
  return {
    name: pkgSpecArr[0],
    version: pkgSpecArr[1],
  }
}

function formatTargetDir(targetDir: string) {
  return targetDir
    .trim()
    .replace(/[<>:"\\|?*]/g, '')
    .replace(/\/+$/g, '')
}

function isEmpty(path: string) {
  const files = readdirSync(path)
  return files.length === 0 || (files.length === 1 && files[0] === '.git')
}

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(projectName)
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
}

function copy(src: string, dest: string) {
  const stat = statSync(src)
  if (stat.isDirectory()) {
    copyDir(src, dest)
  } else {
    copyFileSync(src, dest)
  }
}

function copyDir(srcDir: string, destDir: string) {
  mkdirSync(destDir, { recursive: true })
  for (const file of readdirSync(srcDir)) {
    const srcFile = resolve(srcDir, file)
    const destFile = resolve(destDir, file)
    copy(srcFile, destFile)
  }
}

function getInstallCommand(agent: string) {
  if (agent === 'yarn') {
    return [agent]
  }
  return [agent, 'install']
}

function getRunCommand(agent: string, script: string) {
  switch (agent) {
    case 'yarn':
    case 'pnpm':
    case 'bun':
      return [agent, script]
    case 'deno':
      return [agent, 'task', script]
    default:
      return [agent, 'run', script]
  }
}

export const create: Command = command(
  {
    name: 'create',
    parameters: ['<name>'],
    flags: {
      template: {
        type: Template,
        default: 'app',
        description: 'The template to use for the new project (app, cli)',
      },
    },
    help: {
      description: 'Create a new project',
      examples: [`foxer create <name>`],
    },
  },
  async (argv) => {
    const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
    const pm = pkgInfo ? pkgInfo.name : 'npm'
    const targetDir = formatTargetDir(argv._.name)
    const cwd = process.cwd()
    const root = resolve(cwd, targetDir)

    if (existsSync(root) && !isEmpty(root)) {
      p.log.error('Directory already exists and is not empty')
      process.exit(1)
    }

    let packageName = basename(resolve(targetDir))
    if (!isValidPackageName(packageName)) {
      packageName = toValidPackageName(packageName)
    }

    let template = argv.flags.template
    if (!possibleTemplates.includes(template as Templates)) {
      template = 'app'
    }

    mkdirSync(root, { recursive: true })
    p.log.step(`Scaffolding project in ${root}...`)

    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, `../../template/package.json.tpl`), 'utf-8'),
    )

    pkg.name = packageName

    writeFileSync(resolve(root, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

    if (pm === 'pnpm') {
      copy(
        resolve(__dirname, `../../template/pnpm-workspace.yaml.tpl`),
        resolve(root, 'pnpm-workspace.yaml'),
      )
    }

    copy(resolve(__dirname, `../../template/vite.config.js.tpl`), resolve(root, 'vite.config.ts'))
    copy(resolve(__dirname, `../../template/tsconfig.json.tpl`), resolve(root, 'tsconfig.json'))

    // copy apps/foc-api
    await downloadTemplate('hugomrdias/foxer/examples/api', {
      dir: resolve(root, 'apps/api'),
    })

    await downloadTemplate('hugomrdias/foxer/examples/app', {
      dir: resolve(root, 'apps/app'),
    })

    let doneMessage = ''
    const cdProjectName = relative(cwd, root)
    doneMessage += `Done. Now run:\n`
    if (root !== cwd) {
      doneMessage += `\n  cd ${cdProjectName.includes(' ') ? `"${cdProjectName}"` : cdProjectName}`
    }
    doneMessage += `\n  ${getInstallCommand(pm).join(' ')}`
    doneMessage += `\n  ${getRunCommand(pm, 'dev').join(' ')}`
    p.outro(doneMessage)
  },
)
