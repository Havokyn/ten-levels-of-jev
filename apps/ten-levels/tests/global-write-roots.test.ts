import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pickWriteRoot } from "../extensions/jev-guard.ts";
import { insideRepo } from "../src/levels/level06/write-gate.ts";

const cwd = resolve("/home/u/oryn-linux2");
const roots = [resolve("/home/u/worktrees")];
const allowed = (path: string, r = roots) => insideRepo(resolve(cwd, path), pickWriteRoot(path, cwd, r));

test("global: writes in the cwd or a configured root pass the path check", () => {
  assert.equal(allowed("src/lib.rs"), true);
  assert.equal(allowed(resolve("/home/u/worktrees/linux/fix-746a/src/cache/manifest.rs")), true);
});

test("global: writes outside every root are still blocked", () => {
  for (const path of [
    resolve("/home/u/.ssh/authorized_keys"),
    resolve("/etc/passwd"),
    "../other-repo/x.rs",
    resolve("/home/u/worktrees-evil/x.rs"),
    resolve("/home/u/worktrees/../.bashrc"),
    resolve("/home/u/worktrees"),
  ]) assert.equal(allowed(path), false, path);
});

test("global: no configured roots keeps the cwd-only behavior", () => {
  assert.equal(allowed(resolve("/home/u/worktrees/linux/x.rs"), []), false);
  assert.equal(allowed("src/lib.rs", []), true);
});
