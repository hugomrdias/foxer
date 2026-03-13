import Conf from 'conf'

import packageJson from '../package.json' with { type: 'json' }

const schema = {
  privateKey: {
    type: 'string',
  },
}

export const config = new Conf<{
  privateKey: string
}>({
  projectName: packageJson.name,
  schema,
})

export const name = packageJson.name
export const version = packageJson.version
