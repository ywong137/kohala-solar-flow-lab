import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the completed wind lab", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Kohala Flow Lab · Solar Array Wind Analysis<\/title>/i);
  assert.match(html, /KOHALA FLOW LAB/);
  assert.match(html, /Post-storm cleanup/);
  assert.match(html, /Fully restored array/);
  assert.match(html, /aria-label="Hide floating labels"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /class="slider-marker-tick"/);
  assert.match(html, /Show color-coding on mitigation elements/);
  assert.doesNotMatch(html, /Immediate damage/i);
});

test("server-renders the array configuration page", async () => {
  const response = await render("/configuration");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /ARRAY CONFIGURATION/);
  assert.match(html, /Rows, counts, and offsets/);
  assert.match(html, /Array row-axis bearing/);
  assert.match(html, /Mauka wind bearing/);
});
