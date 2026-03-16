# App example

This example is a Vite + React frontend that consumes the `foxer` SQL API with `@hugomrdias/foxer-client` and `@hugomrdias/foxer-react`.

## What it does

- connects to the API at `http://localhost:4200/sql`
- shares schema types with the companion API example
- uses React Query, Wagmi, and shadcn/ui for the app shell

## Run

Start the API example first in another terminal, then run:

```bash
bun run dev
```

Other useful commands:

```bash
bun run build
bun run preview
bun run check
```

## Notes

- This example imports schema types from the sibling `examples/api` project.
- If you change the API port, update the `baseUrl` in `src/main.tsx`.
