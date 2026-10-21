# Common errors

Log of past mistakes and fixes, grouped by category. Check before repeating similar work.

## Shell / tooling (Windows + Git Bash)

- **Command hung for 120s+ (moved to background).** A `python - <<EOF ... || node -e '...'` one-liner used to patch `app.js` hung (Python on this machine waits on stdin / is a Store stub).
  **Fix:** don't use `python` here; edit files with the Edit/Write tools. Kill strays with `pkill -f python`.
- **`unexpected EOF while looking for matching '`'` — nothing ran.** One huge Bash call mixing several heredocs, `sed` and nested quotes failed to parse, so no files were written.
  **Fix:** write source files with the Write tool (one call per file); keep Bash for short commands (`npm test`, `git`).

## Git workflow

- **Couldn't branch from `main`.** Repo had zero commits, so `main` was unborn and `/git-branch` had nothing to branch from.
  **Fix:** commit the scaffolding baseline on `main` first, then `git checkout -b feature/<name>`.

## Lint (oxlint)

- **`no-unused-vars` on Express error handler.** `(err, req, res, next)` must keep 4 params for Express to treat it as an error handler, but `next` is unused.
  **Fix:** name it `_next`.

## Testing

- **Misleading test name.** A test titled "ignores a client-supplied role" actually asserts Joi rejects the unknown `role` key (400, no create).
  **Fix:** renamed to "rejects a client-supplied role"; name tests after the real behaviour.

- **JSX edit via `node -e '...'` silently dropped quotes.** Single quotes inside a single-quoted shell string turned `field === 'email'` into `field === email` and left regex replacements unapplied; nothing errored.
  **Fix:** use the Edit tool for source changes (same rule as above); if a script is unavoidable, write it to a file first.

- **`node -e` string-replace on a source file silently did nothing (second time).** The search string used the wrong quote style (`it("...")` vs the file's `it('...')`), so `.replace()` matched nothing and no error was raised; the test count not rising was the only sign.
  **Fix:** edit with the Edit tool (it errors on no match). After any scripted edit, check the diff or test count changed as expected.
