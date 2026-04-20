# Sigma.js - Tests

This package contains everything to test sigma.js and its related sub-packages.

## Files structure

- The `./datasets` folder contains useful datasets, used both for end-to-end testing and benchmarking.
- The `./app` folder contains a minimal web application, used for end-to-end testing. It exposes various dependencies,
  datasets and helpers, so that it is easy to write end-to-end test scenarii.
- The `./e2e` folder contains everything related to end-to-end testing (scenarii and snapshots).
- The `./unit` folder contains the unit tests.

## End-to-end testing

End-to-end testing is done using [Playwright](https://playwright.dev/). Basically, it runs some short scenarii before taking a screenshot,
and compare these screenshots to committed reference ones.

WebGL output depends on the host's GPU driver, so snapshots generated on a dev machine do not match the ones generated
on CI. To avoid this drift, `playwright.config.ts` forces Chromium to use SwiftShader (software rendering) for every
test run (local and CI). Both environments share the same Chromium binary (downloaded by Playwright) and the same
renderer, so screenshots are byte-stable.

To regenerate snapshots:

```
npm run test:e2e -- --update-snapshots
```

Commit the `e2e/snapshots/**` changes alongside the code change that required them. Do **not** regenerate snapshots on a
machine that bypasses the pinned SwiftShader config, the committed snapshots must come from the exact configuration CI
uses.

## Unit testing

Unit testing is performed using [Vitest](https://vitest.dev/) in [browser mode](https://vitest.dev/guide/browser.html)
(and [Playwright](https://playwright.dev/) under the hood) to properly test things in an actual browser environment.
This allows testing not only sigma's simplest helpers, but also its lifecycle and other features as well.

## Benchmarking

Benchmarking scenarii have been written to run using the `vitest bench` command.
