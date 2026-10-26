const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createServer } = require("node:net");

const backendDirectory = path.join(__dirname, "..");

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("production server serves frontend securely and keeps browser automation disabled", async () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jobhunter-production-test-"));
  const databaseFile = path.join(temporaryDirectory, "persistent", "production.sqlite");
  const port = await findAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const serverProcess = spawn(process.execPath, ["src/server.js"], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: String(port),
      DB_CLIENT: "sqlite",
      DB_FILE: databaseFile,
      JWT_SECRET: "production-integration-test-secret-0123456789abcdef0123456789",
      AUTOMATION_ENABLED: "false",
      CORS_ORIGINS: "https://app.example.test"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  let errorOutput = "";
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stderr.on("data", (chunk) => {
    errorOutput += chunk;
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (serverProcess.exitCode !== null) {
        throw new Error(`Production API stopped during startup: ${errorOutput}`);
      }
      try {
        if ((await fetch(`${baseUrl}/api/health`)).ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(ready, true, `Production API did not start: ${errorOutput}`);
    assert.ok(fs.existsSync(databaseFile));

    const home = await fetch(`${baseUrl}/`);
    assert.equal(home.status, 200);
    if (fs.existsSync(path.resolve(backendDirectory, "..", "frontend", "dist", "index.html"))) {
      assert.match(home.headers.get("content-type"), /text\/html/);
    }
    assert.ok(home.headers.get("strict-transport-security"));

    const allowedPreflight = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.test", "Access-Control-Request-Method": "GET" }
    });
    assert.equal(allowedPreflight.headers.get("access-control-allow-origin"), "https://app.example.test");

    const rejectedPreflight = await fetch(`${baseUrl}/api/health`, {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example.test", "Access-Control-Request-Method": "GET" }
    });
    assert.equal(rejectedPreflight.headers.get("access-control-allow-origin"), null);

    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "QA User", email: "qa@example.test", password: "a-strong-test-password" })
    });
    assert.equal(registration.status, 201);
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "qa@example.test", password: "a-strong-test-password" })
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();

    const automation = await fetch(`${baseUrl}/api/ai/automation/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ urls: ["https://linkedin.com"] })
    });
    assert.equal(automation.status, 503);
  } finally {
    if (serverProcess.exitCode === null) {
      const exited = new Promise((resolve) => serverProcess.once("exit", resolve));
      serverProcess.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
