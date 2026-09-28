import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, touchesSecret } from "../extensions/report.ts";

test("global: secret paths and key material are caught", () => {
  for (const hit of [
    { command: "cat /etc/tv-weex-trader/env" },
    { command: "sudo cp x /etc/tv-weex-trader/env" },
    { path: "/home/orynagent/.pi/agent/auth.json" },
    { path: "C:\\Users\\havok\\.pi\\agent\\auth.json" },
    { command: "ls ~/.ssh" },
    { path: "/home/u/.ssh/id_ed25519" },
    { command: "cat ~/.config/jev/openrouter-key" },
    { path: "O:\\Secrets\\oryn_droplet" },
    { command: "grep WEEX_API_KEY run.sh" },
    { content: "Authorization: Bearer abc" },
    { content: "key=sk-or-v1-0123" },
    { content: "-----BEGIN OPENSSH PRIVATE KEY-----" },
    { content: "export GITHUB_TOKEN=ghp_abc" },
    { command: "echo $DB_PASSWORD" },
  ]) assert.equal(touchesSecret(hit), true, JSON.stringify(hit));
});

test("global: ordinary work is not caught", () => {
  for (const miss of [
    { command: "cargo test --workspace" },
    { command: "git status" },
    { path: "src/domain/billing.ts" },
    { current_request: "compact when the context has too many tokens" },
    { command: "cat environment.md" },
    { path: "/home/orynagent/oryn-linux/src/envelope.rs" },
  ]) assert.equal(touchesSecret(miss), false, JSON.stringify(miss));
});

test("global: decide refuses secret state before any network call", async () => {
  const pi = { appendEntry() {} };
  await assert.rejects(
    decide(pi, "test", { command: "cat /etc/tv-weex-trader/env" }, { q: { type: "noul", instructions: "x?", criteria: { true: "a", false: "b" } } } as any),
    /touches a secret/,
  );
});
