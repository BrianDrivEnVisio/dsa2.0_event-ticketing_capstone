# AI log

Every time you give an AI tool a significant prompt, add an entry. Three lines each.
"Nothing was wrong" is allowed, but it is rarely true. Your instructor will read this.

## Build 1

### Prompt 1: Build 1 prompt (docs/build-1.md)

- **What I asked:** The Build 1 prompt: Create files `src/domain/error.js`, `src/domain/ids.js`, `src/domain/waitlistQueue.js`, `src/domain/inventory.js`, `scripts/demo.js`, `scripts\benchmark-lookup.js` and update `package.json` to `type:module`
- **What came back:** Implemented the domain core and terminal scripts. `package.json` already had `"type": "module"`; I added the `demo` and `benchmark` scripts.
- **What was wrong (or "nothing"):** Nothing was wrong.

## Build 2

### Prompt 1: Build 2 prompt (docs/build-2.md)

- **What I asked:** The Build 2 prompt: Adding scripts that handle event search, filtering and sorting including performing automated tests.
- **What came back:** Implemented merge sort, event publishing/listing, pure event filtering and sorting, and tests for the Build 2 criteria. Added the three missing S04 criteria to the build doc and set npm test to run node --test.

Added to project folder: `src\domain\eventSearch.js`, `src\domain\inventory.js`, `src\domain\sorting.js`, `test\event-search.test.js`, `test\inventory.test.js`

Updated: `docs\build-2.md`, `package.json`

- **What was wrong (or "nothing"):** Could not run npm test or the demo—the environment’s PowerShell runner was unavailable, and VS Code test discovery had no registered test controller.

### Prompt 2: Re-attempt npm test task

- **What I asked:** Attempt npm test task again
- **What came back:** Retried npm test, but the command runner still can’t start because PowerShell is unavailable. No tests ran, so there’s no exit code or test summary.
