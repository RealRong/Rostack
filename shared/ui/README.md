# Shared UI

This directory is the shared UI surface for the repo.

- `css/` contains the shared theme tokens and reusable CSS primitives.
- `src/` contains the canonical shared React primitives and supporting utilities.
- `tailwind/` contains shared Tailwind config fragments.
- Internal package imports should use `#ui/*`.
- Cross-package consumers should import from `@shared/ui` or `@shared/ui/*`.
