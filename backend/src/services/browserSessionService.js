const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const profileDirectory = path.join(__dirname, "..", "..", "data", "automation-profiles");
const sessions = new Map();
const allowedDomains = [
  "linkedin.com",
  "indeed.com",
  "indeed.com.br",
  "infojobs.com.br",
  "glassdoor.com",
  "glassdoor.com.br",
  "remotive.com",
  "remoteok.com",
  "weworkremotely.com",
  "workable.com",
  "lever.co",
  "greenhouse.io",
  "catho.com.br"
];
const maxTargetsPerSession = 6;
const sessionTimeoutMs = 2 * 60 * 60 * 1000;

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) {
    const [first, second] = octets;
    return first === 0
      || first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }

  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

function normalizeAndValidateUrls(rawUrls) {
  const urls = Array.isArray(rawUrls) ? rawUrls : String(rawUrls || "").split(/\n|,/);
  const normalizedUrls = urls.map((value) => String(value || "").trim()).filter(Boolean);

  if (!normalizedUrls.length) {
    throw inputError("Informe pelo menos uma URL de vaga ou portal.");
  }

  if (normalizedUrls.length > maxTargetsPerSession) {
    throw inputError(`É possível abrir no máximo ${maxTargetsPerSession} páginas por sessão.`);
  }

  return normalizedUrls.map((value) => {
    let url;

    try {
      url = new URL(value);
    } catch {
      throw inputError(`URL inválida: ${value}`);
    }

    if (url.protocol !== "https:" || url.username || url.password) {
      throw inputError("Por segurança, use somente URLs HTTPS sem credenciais embutidas.");
    }

    const isAllowedDomain = allowedDomains.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );

    if (!isAllowedDomain) {
      throw inputError(`Domínio não autorizado para automação: ${url.hostname}`);
    }

    return url.toString();
  });
}

function clearSessionTimer(session) {
  if (session.timeout) {
    clearTimeout(session.timeout);
    session.timeout = null;
  }
}

async function stopSession(userId) {
  const session = sessions.get(String(userId));
  if (!session) {
    return { status: "not_running" };
  }

  sessions.delete(String(userId));
  clearSessionTimer(session);
  await session.context.close();
  return { status: "stopped", sessionId: session.sessionId };
}

async function startSession(userId, rawUrls) {
  const urls = normalizeAndValidateUrls(rawUrls);
  const key = String(userId);
  const existingSession = sessions.get(key);
  if (existingSession) {
    if (existingSession.context.pages().length) {
      return {
        status: "already_running",
        sessionId: existingSession.sessionId,
        results: existingSession.results
      };
    }
    await stopSession(userId);
  }

  fs.mkdirSync(profileDirectory, { recursive: true });

  const context = await chromium.launchPersistentContext(
    path.join(profileDirectory, `user-${Number(userId)}`),
    {
      headless: false,
      viewport: null
    }
  );
  const session = {
    sessionId: `${Date.now()}-${Number(userId)}`,
    context,
    results: [],
    timeout: null
  };
  sessions.set(key, session);
  context.on("close", () => {
    clearSessionTimer(session);
    if (sessions.get(key) === session) {
      sessions.delete(key);
    }
  });

  try {
    for (const url of urls) {
      const page = await context.newPage();
      await page.route("**/*", async (route) => {
        const requestUrl = new URL(route.request().url());

        if (requestUrl.protocol !== "https:" || isPrivateHost(requestUrl.hostname)) {
          await route.abort();
          return;
        }

        await route.continue();
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      session.results.push({
        url,
        title: await page.title(),
        status: "opened"
      });
    }
  } catch (error) {
    await stopSession(userId);
    throw new Error(`Não foi possível abrir as páginas: ${error.message}`);
  }

  session.timeout = setTimeout(() => {
    stopSession(userId).catch((error) => {
      console.error("Falha ao encerrar sessão de automação expirada:", error);
    });
  }, sessionTimeoutMs);
  session.timeout.unref();

  return {
    status: "browser_opened",
    sessionId: session.sessionId,
    results: session.results
  };
}

function getSessionStatus(userId) {
  const session = sessions.get(String(userId));

  if (!session || !session.context.pages().length) {
    return { status: "not_running" };
  }

  return {
    status: "running",
    sessionId: session.sessionId,
    results: session.results
  };
}

module.exports = {
  normalizeAndValidateUrls,
  startSession,
  stopSession,
  getSessionStatus
};
