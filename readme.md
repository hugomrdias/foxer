# Foxer Monorepo

This repository contains the core `foxer` packages plus the internal apps and examples used to develop and test them.

## Packages

- [`packages/foxer`](./packages/foxer) - Core Filecoin indexing runtime, config helpers, and CLI
- [`packages/foxer-client`](./packages/foxer-client) - Typed client for querying `foxer` SQL endpoints
- [`packages/foxer-react`](./packages/foxer-react) - React bindings for `foxer-client` powered by React Query

## Apps

- [`apps/foc-api`](./apps/foc-api) - Workspace API/indexer built with `@hugomrdias/foxer`
- [`apps/foc-app`](./apps/foc-app) - Workspace React app that consumes the API with `foxer-client` and `foxer-react`
- [`apps/erpc`](./apps/erpc) - eRPC configuration for Calibration RPC access and caching

## Examples

- [`examples/api`](./examples/api) - Standalone API example used by the scaffolding flow
- [`examples/app`](./examples/app) - Standalone React example used by the scaffolding flow
- [`examples/cli`](./examples/cli) - CLI example project

## Development

Install dependencies from the repository root:

```bash
pnpm install
```

Common commands:

```bash
pnpm build
pnpm lint
```

Run the workspace demo apps:

```bash
pnpm --filter foc-api dev
pnpm --filter foc-app dev
```

## Contributing

See the contribution guide in [`.github/CONTRIBUTING.md`](./.github/CONTRIBUTING.md).

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/hugomrdias/foxer)

## License

MIT © [Hugo Dias](http://hugodias.me)
