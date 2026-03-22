# Performance Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Toss homepage bundle cost, stop transfer-progress rerender fanout, and replace the share fallback with a safer temp-file flow.

**Architecture:** Split stable session state from high-frequency transfer state, defer QR UI with dynamic imports, and move share fallback persistence into a filesystem helper under `/tmp`. Keep user-facing behavior unchanged while improving bundle composition and runtime efficiency.

**Tech Stack:** Next.js 16, React 19, Node built-in test runner, TypeScript, App Router

---

## Task 1: Lock the desired architecture with failing tests

**Files:**
- Create: `tests/performance-architecture.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `node --experimental-strip-types --test tests/performance-architecture.test.ts` and verify it fails**
- [ ] **Step 3: Add a reusable `npm test` command for the Node test runner**
- [ ] **Step 4: Re-run the failing test and confirm it still fails for the intended reasons**

## Task 2: Move share fallback persistence to temp files

**Files:**
- Create: `lib/share-storage.ts`
- Create: `tests/share-storage.test.ts`
- Modify: `app/share/route.ts`
- Modify: `hooks/use-share-target.ts`

- [ ] **Step 1: Write the failing share-storage tests**
- [ ] **Step 2: Run `node --experimental-strip-types --test tests/share-storage.test.ts` and verify failure**
- [ ] **Step 3: Implement the temp-file helper with cleanup and retrieval primitives**
- [ ] **Step 4: Update the share route to use the helper and add GET/DELETE handling**
- [ ] **Step 5: Update the client fallback to fetch manifest + file blobs**
- [ ] **Step 6: Re-run the share-storage tests and make sure they pass**

## Task 3: Shrink the homepage client entry and narrow rerender subscriptions

**Files:**
- Modify: `components/room-panel.tsx`
- Modify: `components/transfer-panel.tsx`
- Modify: `app/page.tsx`
- Modify: `lib/transfer-context.tsx`

- [ ] **Step 1: Implement dynamic QR dialog imports in the room panel**
- [ ] **Step 2: Split transfer items into a dedicated context/hook**
- [ ] **Step 3: Update consumers to use the narrower hooks**
- [ ] **Step 4: Memoize the app shell boundary so item-only updates do not rerender unrelated UI**
- [ ] **Step 5: Re-run the architecture test and make sure it passes**

## Task 4: Restore strict build checks and verify everything

**Files:**
- Modify: `next.config.mjs`
- Modify: `package.json`

- [ ] **Step 1: Remove TypeScript build-error suppression**
- [ ] **Step 2: Update `baseline-browser-mapping`**
- [ ] **Step 3: Run `npm run lint`**
- [ ] **Step 4: Run `npm test`**
- [ ] **Step 5: Run `./node_modules/.bin/tsc --noEmit`**
- [ ] **Step 6: Run `npm run build`**
