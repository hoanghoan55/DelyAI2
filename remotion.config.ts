import path from 'node:path'
import { Config } from '@remotion/cli/config'

// The whole `src/**` tree imports through the `@/*` alias (tsconfig `paths`,
// mirrored by vite.config.ts and vitest.config.ts). Remotion's bundler is
// webpack and resolves none of those, so mirror the alias here. Same single
// source of truth for the target: `./src`.
Config.overrideWebpackConfig((config) => {
  config.resolve = config.resolve ?? {}
  config.resolve.alias = {
    ...(config.resolve.alias ?? {}),
    '@': path.resolve(process.cwd(), 'src'),
  }
  return config
})
