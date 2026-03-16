# foc-app

`foc-app` is the workspace React frontend that consumes `foc-api` through `@hugomrdias/foxer-client` and `@hugomrdias/foxer-react`.

## Run

From the repository root, start the API first and then the app:

```bash
bun --filter foc-api dev
bun --filter foc-app dev
```

Other useful commands:

```bash
bun --filter foc-app build
bun --filter foc-app preview
bun --filter foc-app check
```

## Notes

- The app expects the API SQL endpoint at `http://localhost:4200/sql`.
- It imports schema types from the sibling `foc-api` workspace package.
- If you change the API port, update the `baseUrl` in `src/main.tsx`.
