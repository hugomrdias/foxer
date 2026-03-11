import { existsSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import * as p from '@clack/prompts'
import { type Command, command } from 'cleye'

const possibleTemplates = ['app', 'cli'] as const
type Templates = (typeof possibleTemplates)[number]

const Template = (template: Templates) => {
  if (!possibleTemplates.includes(template)) {
    throw new Error(`Invalid template: "${template}"`)
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
  return /^(?:@[a-z\d\-*~][a-z\d\-*._~]*\/)?[a-z\d\-~][a-z\d\-._~]*$/.test(
    projectName
  )
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z\d\-~]+/g, '-')
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
  (argv) => {
    const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
    const pm = pkgInfo ? pkgInfo.name : 'npm'
    const targetDir = formatTargetDir(argv._.name)
    const cwd = process.cwd()
    const root = resolve(cwd, targetDir)

    console.log('🚀 ~ root:', root)

    console.log('🚀 ~ targetDir:', targetDir)
    console.log('🚀 ~ pm:', pkgInfo)

    if (existsSync(root) && !isEmpty(root)) {
      p.log.error('Directory already exists and is not empty')
      process.exit(1)
    }

    let packageName = basename(resolve(targetDir))
    if (!isValidPackageName(packageName)) {
      packageName = toValidPackageName(packageName)
    }
    console.log('🚀 ~ packageName:', packageName)
  }
)
