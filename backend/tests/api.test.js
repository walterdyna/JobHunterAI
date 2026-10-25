const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { createServer } = require("node:net");
const { analyzeJobFit, buildFallbackResponse, extractKeywords } = require("../src/services/aiService");
const { normalizeAndValidateUrls } = require("../src/services/browserSessionService");

const backendDirectory = path.join(__dirname, "..");
let serverProcess;
let temporaryDirectory;
let baseUrl;

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

async function request(pathname, { method = "GET", token, body } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

before(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "jobhunter-api-test-"));
  const port = await findAvailablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ["src/server.js"], {
    cwd: backendDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      DB_CLIENT: "sqlite",
      DB_FILE: path.join(temporaryDirectory, "test.sqlite"),
      JWT_SECRET: "jobhunter-automated-test-secret",
      OLLAMA_BASE_URL: "http://127.0.0.1:1/api/generate"
    },
    stdio: "ignore"
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`API de teste encerrou antes de iniciar (código ${serverProcess.exitCode}).`);
    }
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error("API de teste não ficou pronta dentro do prazo.");
});

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill();
    await Promise.race([
      new Promise((resolve) => serverProcess.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
  }
  if (temporaryDirectory) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("API protects accounts, isolates application history, and rejects unsafe automation URLs", async () => {
  const firstRegistration = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Candidate One", email: "one@example.test", password: "a-strong-test-password" }
  });
  const secondRegistration = await request("/api/auth/register", {
    method: "POST",
    body: { name: "Candidate Two", email: "two@example.test", password: "another-test-password" }
  });
  assert.equal(firstRegistration.status, 201);
  assert.equal(secondRegistration.status, 201);

  const firstLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "one@example.test", password: "a-strong-test-password" }
  });
  const secondLogin = await request("/api/auth/login", {
    method: "POST",
    body: { email: "two@example.test", password: "another-test-password" }
  });
  const firstToken = firstLogin.body.token;
  const secondToken = secondLogin.body.token;
  assert.ok(firstToken);
  assert.ok(secondToken);

  const unauthenticatedApplications = await request("/api/applications");
  assert.equal(unauthenticatedApplications.status, 401);

  const created = await request("/api/applications", {
    method: "POST",
    token: firstToken,
    body: {
      title: "Backend Developer",
      company: "Example Co",
      platform: "LinkedIn",
      resumeSnapshot: "Currículo preparado para esta vaga.",
      coverLetterSnapshot: "Carta preparada para esta vaga.",
      fitScore: 82
    }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.title, "Backend Developer");
  assert.equal(created.body.resume_snapshot, "Currículo preparado para esta vaga.");
  assert.equal(created.body.cover_letter_snapshot, "Carta preparada para esta vaga.");
  assert.equal(created.body.fit_score, 82);

  const invalidFitScore = await request("/api/applications", {
    method: "POST",
    token: firstToken,
    body: { title: "Invalid", company: "Example Co", fitScore: 120 }
  });
  assert.equal(invalidFitScore.status, 400);

  const firstApplications = await request("/api/applications", { token: firstToken });
  const secondApplications = await request("/api/applications", { token: secondToken });
  assert.equal(firstApplications.body.length, 1);
  assert.equal(secondApplications.body.length, 0);

  const crossAccountDelete = await request(`/api/applications/${created.body.id}`, {
    method: "DELETE",
    token: secondToken
  });
  assert.equal(crossAccountDelete.status, 404);

  const unsafeAutomation = await request("/api/ai/automation/run", {
    method: "POST",
    token: firstToken,
    body: { urls: ["http://127.0.0.1"] }
  });
  assert.equal(unsafeAutomation.status, 400);

  const generated = await request("/api/ai/generate", {
    method: "POST",
    body: {
      fullName: "Candidate One",
      targetRole: "Desenvolvedor Node.js",
      experience: "Desenvolveu serviços com Node.js.",
      skills: ["Node.js"],
      resumeText: "Experiência: Node.js. Idioma: Inglês básico.",
      jobDescription: "Requisito obrigatório: Node.js e inglês avançado."
    }
  });
  assert.equal(generated.status, 200);
  assert.match(generated.body.resume, /Inglês básico/i);
  assert.ok(generated.body.requirementsAnalysis.languages.gaps.some((gap) => /exige nível advanced.*informa nível basic/i.test(gap)));
  assert.ok(generated.body.requirementsAnalysis.evidence.some((item) =>
    item.term === "node" && item.sources.includes("Currículo importado")
  ));
  assert.ok(generated.body.requirementsAnalysis.matched.includes("node"));
  assert.doesNotMatch(generated.body.coverLetter, /inglês avançado|fluente/i);
  assert.match(generated.body.summary.match, /não representa probabilidade de contratação/i);
  assert.doesNotMatch(generated.body.resume, /Resumo profissional não informado|Experiência não informada/);
  assert.doesNotMatch(generated.body.resume, /melhoria contínua|seu-perfil|seu-usuario/i);
});

test("resume matching uses normalized keywords and preserves confirmed language limits", () => {
  assert.ok(extractKeywords("Experiência com gestão de projetos e automação").includes("gestao"));
  const result = buildFallbackResponse({
    fullName: "Candidate",
    targetRole: "Desenvolvedor",
    resumeText: "Inglês básico. Projeto real com Node.js.",
    skills: ["Node.js"]
  }, "Node.js e inglês avançado são obrigatórios.");

  assert.equal(result.requirementsAnalysis.languages.gaps.length, 1);
  assert.match(result.resume, /Conteúdo original do currículo\nInglês básico/i);
  assert.ok(result.score < 70);
});

test("browser URL validation allows approved HTTPS portals and blocks unsafe targets", () => {
  assert.equal(normalizeAndValidateUrls(["https://www.linkedin.com/jobs/"])[0], "https://www.linkedin.com/jobs/");
  assert.throws(() => normalizeAndValidateUrls(["http://linkedin.com"]), /somente URLs HTTPS/);
  assert.throws(() => normalizeAndValidateUrls(["https://localhost"]), /Domínio não autorizado/);
  assert.throws(() => normalizeAndValidateUrls(["https://example.com"]), /Domínio não autorizado/);
});

test("job fit weights mandatory requirements above preferred qualifications", () => {
  const fit = analyzeJobFit(
    "Requisito obrigatório: Node.js e React. Diferencial desejável: AWS.",
    "Experiência comprovada com Node.js."
  );
  assert.ok(fit.matched.includes("node"));
  assert.ok(fit.missingRequired.includes("react"));
  assert.ok(fit.missingPreferred.includes("aws"));
  assert.ok(fit.score < 70);
});
