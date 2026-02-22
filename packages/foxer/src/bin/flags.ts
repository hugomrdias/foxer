import path from 'node:path'

const Root = (dir: string) => {
  return path.resolve(dir)
}

export const globalFlags = {
  config: {
    type: String,
    description: 'The path to the config file',
  },
  root: {
    type: Root,
    description: 'The root directory of the project',
    default: process.cwd(),
  },
} as const
