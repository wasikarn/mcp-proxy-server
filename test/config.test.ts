import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.js";

async function withConfig(obj: unknown): Promise<ReturnType<typeof loadConfig>> {
  const p = `${import.meta.dir}/.tmp-${Math.random().toString(36).slice(2)}.json`;
  await Bun.write(p, JSON.stringify(obj));
  try {
    return await loadConfig(p);
  } finally {
    await Bun.file(p).delete();
  }
}

describe("loadConfig", () => {
  test("defaults args to []", async () => {
    const c = await withConfig({ servers: { a: { command: "x" } } });
    expect(c.servers.a.args).toEqual([]);
  });

  test("rejects empty command", async () => {
    await expect(withConfig({ servers: { a: { command: "", args: [] } } })).rejects.toThrow();
  });

  test("rejects non-string args elements", async () => {
    await expect(withConfig({ servers: { a: { command: "x", args: [1, null] } } })).rejects.toThrow();
  });

  test("rejects env that is not a string map", async () => {
    await expect(withConfig({ servers: { a: { command: "x", args: [], env: "PATH=/x" } } })).rejects.toThrow();
    await expect(withConfig({ servers: { a: { command: "x", args: [], env: { A: 1 } } } })).rejects.toThrow();
  });

  test("rejects the two name shapes the router can never match (slash, empty)", async () => {
    await expect(withConfig({ servers: { "a/b": { command: "x", args: [] } } })).rejects.toThrow(/Invalid key|too small/);
    await expect(withConfig({ servers: { "": { command: "x", args: [] } } })).rejects.toThrow(/Invalid key|too small/);
  });
});
