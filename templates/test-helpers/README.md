# GSD-T Test Helpers

Helpers a project's E2E suite can copy in.

## `launch-extension.ts`

Launches Chromium with an unpacked MV3 browser extension **without stealing keyboard focus** or opening a visible window.

- Copy it into `e2e/helpers/` and set `EXTENSION_PATH` to the built extension folder.
- Default mode is the new headless Chromium (`channel: 'chromium'` + `headless: true`) — it loads MV3 extensions and never activates a window. `headless: true` alone launches the old headless shell, which silently cannot load extensions.
- `HEADED=1` opens a visible window (opt-in only); `E2E_MODE=offscreen` is an off-screen headed mode kept for a future Chrome regression.

The file's header comment has the full explanation.
