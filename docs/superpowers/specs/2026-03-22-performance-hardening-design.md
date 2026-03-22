# Toss Performance Hardening Design

## Goal

Resolve the performance and quality issues identified in the React/Next.js review without changing the user-facing transfer flow.

## Scope

1. Remove QR code UI from the homepage critical bundle.
2. Narrow context subscriptions so transfer progress updates do not rerender unrelated UI.
3. Replace the share-route in-memory base64 fallback with a temp-file backed flow.
4. Re-enable type failures during build and clear the stale Baseline dependency warning.

## Design

### 1. QR code features become on-demand client code

`components/room-panel.tsx` will stop statically importing the QR display and scanner dialogs. Both dialogs will be loaded with `next/dynamic` and only rendered once the user opens the corresponding affordance. This follows Vercel's `bundle-dynamic-imports` guidance and keeps large optional dependencies out of the homepage entry chunk.

### 2. Split stable session state from high-frequency transfer state

`lib/transfer-context.tsx` will expose two contexts:

- `useTransfer()` for room/session/notification/connection state
- `useTransferItems()` for transfer items and item-mutating actions

`components/transfer-panel.tsx` will subscribe to both contexts. `app/page.tsx` and `components/room-panel.tsx` will subscribe only to the stable session context. `AppShell` will be memoized so item updates do not cascade through the shell when its subscribed state is unchanged.

### 3. Share fallback moves to temp files

`app/share/route.ts` will delegate persistence to a new filesystem-backed helper. POST requests will store manifest metadata plus uploaded files under `/tmp/toss-share-target/<share-id>`. GET without a `file` parameter will return a manifest with file download URLs. GET with `file=<index>` will return the binary file contents. DELETE will remove the payload after the client finishes retrieval. Expired payloads will be cleaned opportunistically.

`hooks/use-share-target.ts` will keep the existing IndexedDB-first behavior, then use the new manifest + file URL fallback to reconstruct `File` objects in the browser without base64 round-tripping.

### 4. Build correctness

`next.config.mjs` will stop ignoring TypeScript build errors. `package.json` will update `baseline-browser-mapping` so build output matches the current browser data set.

## Verification

- Node test runner checks that QR dialogs are dynamically imported and that transfer items are split into a dedicated hook.
- Node test runner covers the temp-file share storage lifecycle.
- `npm run lint`
- `npm test`
- `./node_modules/.bin/tsc --noEmit`
- `npm run build`

