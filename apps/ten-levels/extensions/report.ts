/**
 * The side channel every agent level extension reports on.
 *
 * One JSON line per event on stderr, prefixed `JEV_EVENT`, which the lab's session manager
 * folds into the window's stream in real time. The same payload is appended to the pi
 * session as a custom entry, so the session file holds the permanent record.
 *
 * `decide` is the one way an extension calls Jev: it validates, calls, reports, and returns.
 * `extra` must not use the keys the report already sets: source, state, questions, answers, usage, model, ms.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { JevClient } from "../src/core/client.ts";
import { validateQuestions, type Answer, type Questions, type State } from "../src/core/types.ts";

/** Outside the lab (no JEV_LEVEL_CONFIG) events go to a log file, not the pi TUI's stderr. */
const IN_LAB = process.env.JEV_LEVEL_CONFIG !== undefined;
const JEV_DIR = join(homedir(), ".config", "jev");
const EVENT_LOG = join(JEV_DIR, "events.log");

/** A pi started before the key was set still finds it in ~/.config/jev/openrouter-key. */
function loadKey(): void {
  if (process.env.OPENROUTER_API_KEY || process.env.TYPESAFE_API_KEY) return;
  try {
    const key = readFileSync(join(JEV_DIR, "openrouter-key"), "utf8").trim();
    if (key) process.env.OPENROUTER_API_KEY = key;
  } catch { /* no key file: the client reports the missing credential */ }
}

/** State touching these never goes to Jev or the event log: it may hold a credential. */
export const SECRET = /\/etc\/tv-weex-trader|auth\.json|[\\/]\.ssh([\\/]|\b)|[\\/]\.config[\\/]jev|[\\/]Secrets([\\/]|\b)|[\\/]env\b|secret|credential|api[_-]?key|password|passwd|private[_-]?key|bearer |sk-or-|sk-ant-|ghp_|github_pat_|-----BEGIN/i;
export const touchesSecret = (value: unknown): boolean => SECRET.test(JSON.stringify(value ?? {}));

let client: JevClient | undefined;
export const jev = () => (client ??= (loadKey(), new JevClient({ provider: "openrouter" })));

/** The level config the lab passed in, JEV_LEVEL_CONFIG as JSON. */
export function levelConfig<T extends object>(fallback: T): T {
  try {
    const raw = IN_LAB ? process.env.JEV_LEVEL_CONFIG : readFileSync(join(JEV_DIR, "config.json"), "utf8");
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

export function report(pi: any, kind: string, payload: Record<string, unknown>): void {
  const body = { kind, at: Date.now(), ...payload };
  const line = "JEV_EVENT " + JSON.stringify(body) + "\n";
  if (IN_LAB) process.stderr.write(line);
  else try { mkdirSync(JEV_DIR, { recursive: true }); appendFileSync(EVENT_LOG, line); } catch { /* logging is optional */ }
  try { pi.appendEntry?.(`jev-${kind}`, payload); } catch { /* entries are optional */ }
}

export interface Decision {
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number; cost?: number };
  model: string;
  ms: number;
}

/**
 * One Jev call from inside the harness. `source` names who asked, a hook or a tool, so the
 * window can label the row. The full state, questions, and answers travel on the side channel.
 */
export async function decide(pi: any, source: string, state: State, questions: Questions, extra: Record<string, unknown> = {}): Promise<Decision> {
  validateQuestions(questions);
  if (!IN_LAB && touchesSecret(state)) throw new Error("jev: state touches a secret, not sent");
  const started = performance.now();
  const result = await jev().systemOne(state, questions);
  const out: Decision = { answers: result.answers, usage: result.usage, model: result.model, ms: Math.round(performance.now() - started) };
  report(pi, "jev", { source, state, questions, answers: out.answers, usage: out.usage, model: out.model, ms: out.ms, ...extra });
  return out;
}
