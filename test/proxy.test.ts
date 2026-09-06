import { describe, expect, test } from "bun:test";
import { BackendConnection, ProxyManager } from "../src/proxy.js";

const ECHO = { command: "bun", args: [`${import.meta.dir}/fixtures/echo-server.ts`] };

async function until(pred: () => boolean, ms = 3000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await Bun.sleep(20);
  }
}

describe("BackendConnection", () => {
  test("ready flips to false when the child process dies", async () => {
    const b = new BackendConnection("echo", ECHO);
    await b.start();
    expect(b.ready).toBe(true);
    process.kill(b.pid!, "SIGKILL");
    await until(() => !b.ready);
    expect(b.ready).toBe(false);
  });

  test("createProxyServer before start throws instead of returning a hollow server", () => {
    const b = new BackendConnection("echo", ECHO);
    expect(() => b.createProxyServer()).toThrow(/not connected/);
  });

  test("ready is not assignable from outside", async () => {
    const b = new BackendConnection("echo", ECHO);
    // @ts-expect-error ready is a getter
    expect(() => { b.ready = true; }).toThrow();
    expect(b.ready).toBe(false);
  });
});

describe("ProxyManager", () => {
  test("second startAll for the same name does not orphan the first child", async () => {
    const m = new ProxyManager();
    await m.startAll({ echo: ECHO });
    const first = m.getBackend("echo")!;
    await m.startAll({ echo: ECHO });
    expect(m.getBackend("echo")).toBe(first);
    await m.stopAll();
  });
});
