const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { createServer } = require("node:net");
const { analyzeJobFit, buildFallbackResponse, extractKeywords } = require("../src/services/aiService");
const {
  isPrivateHost,
  normalizeAndValidateUrls,
  validateRequestUrl
} = require("../src/services/browserSessionService");

const backendDirectory = path.join(__dirname, "..");
let serverProcess;
let temporaryDirectory;
let baseUrl;
let serverErrorOutput = "";

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
    headers: response.headers,
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
      JWT_SECRET: "jobhunter-automated-test-secret-with-64-char-padding-0123456789",
      OLLAMA_BASE_URL: "http://127.0.0.1:1/api/generate"
    },
    stdio: ["ignore", "ignore", "pipe"]
  });
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stderr.on("data", (chunk) => {
    serverErrorOutput += chunk;
  });

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`API de teste encerrou antes de iniciar (código ${serverProcess.exitCode}): ${serverErrorOutput}`);
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

  const companyCreated = await request("/api/companies", {
    method: "POST",
    token: firstToken,
    body: { name: "Example Co", city: "Vitória" }
  });
  assert.equal(companyCreated.status, 201);
  assert.equal(companyCreated.body.name, "Example Co");

  const vacancyCreated = await request("/api/vacancies", {
    method: "POST",
    token: firstToken,
    body: { title: "Backend Developer", company: "Example Co", salary: 5000 }
  });
  assert.equal(vacancyCreated.status, 201);
  assert.equal(vacancyCreated.body.title, "Backend Developer");

  const vacancyUpdated = await request(`/api/vacancies/${vacancyCreated.body.id}`, {
    method: "PUT",
    token: firstToken,
    body: { title: "Senior Backend Developer" }
  });
  assert.equal(vacancyUpdated.status, 200);
  assert.equal(vacancyUpdated.body.title, "Senior Backend Developer");

  const unauthenticatedApplications = await request("/api/applications");
  assert.equal(unauthenticatedApplications.status, 401);
  const anonymousAiGeneration = await request("/api/ai/generate", {
    method: "POST",
    body: { fullName: "Candidate One" }
  });
  assert.equal(anonymousAiGeneration.status, 401);

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
  assert.equal(created.headers.get("content-security-policy") !== null, true);
  assert.equal(created.headers.get("x-content-type-options"), "nosniff");

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
    token: firstToken,
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

  const failedLogins = await Promise.all(Array.from({ length: 7 }, () => request("/api/auth/login", {
    method: "POST",
    body: { email: "one@example.test", password: "incorrect-password" }
  })));
  assert.ok(failedLogins.slice(0, 6).every((result) => result.status === 401));
  assert.equal(failedLogins[6].status, 429);
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

test("browser request validation blocks redirects to non-portal domains and private DNS answers", async () => {
  const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];
  const privateLookup = async () => [{ address: "10.0.0.8", family: 4 }];

  await assert.rejects(
    validateRequestUrl("https://attacker.example/", publicLookup),
    /Destino externo bloqueado/
  );
  await assert.rejects(
    validateRequestUrl("https://jobs.linkedin.com/", privateLookup),
    /endereço privado/
  );
  await assert.rejects(
    validateRequestUrl("http://www.linkedin.com/", publicLookup),
    /Destino externo bloqueado/
  );
  await validateRequestUrl("https://jobs.linkedin.com/", publicLookup);
});

test("private host detection blocks IPv4, IPv6, mapped IPv6, and reserved ranges", () => {
  for (const host of [
    "127.0.0.1",
    "10.0.0.1",
    "100.64.0.1",
    "169.254.1.1",
    "192.168.1.1",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "[::ffff:7f00:1]",
    "::ffff:192.168.0.1"
  ]) {
    assert.equal(isPrivateHost(host), true, `${host} must be treated as non-public`);
  }
  assert.equal(isPrivateHost("8.8.8.8"), false);
  assert.equal(isPrivateHost("2001:4860:4860::8888"), false);
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

test("backend refuses to load without a strong JWT secret", () => {
  const result = spawnSync(process.execPath, [
    "-e",
    "process.env.JWT_SECRET=''; require('./src/config/environment');"
  ], {
    cwd: backendDirectory,
    env: { ...process.env, JWT_SECRET: "" },
    encoding: "utf8"
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET obrigatório/);
});
