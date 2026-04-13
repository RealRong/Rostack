# Shared UI

This directory is the shared UI surface for the repo.

- `css/` contains the shared theme tokens and reusable CSS primitives.
- `react/` contains shared React entry points where the current dependency layout allows it.
- `tailwind/` contains shared Tailwind config fragments.

Current constraint:

- The canonical implementation of some React primitives still lives under `dataview/src/react/ui`.
- Shared React entry points should only expose components that can be consumed safely with the current package-local dependency layout.
