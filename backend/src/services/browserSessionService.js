const fs = require("fs");
const path = require("path");
const net = require("node:net");
const { lookup } = require("node:dns").promises;
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
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    const octets = host.split(".").map(Number);
    const [first, second, third] = octets;
    return first === 0
      || first === 10
      || first === 127
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && (second === 168 || (second === 0 && third === 0)))
      || (first === 198 && (second === 18 || second === 19 || (second === 51 && third === 100)))
      || (first === 203 && second === 0 && third === 113)
      || first >= 224;
  }

  if (ipVersion !== 6) return false;
  if (host === "::" || host === "::1") return true;

  const mapped = host.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    const mappedIpv4 = mapped[1] || [
      parseInt(mapped[2], 16) >> 8,
      parseInt(mapped[2], 16) & 255,
      parseInt(mapped[3], 16) >> 8,
      parseInt(mapped[3], 16) & 255
    ].join(".");
    return isPrivateHost(mappedIpv4);
  }

  const firstGroup = parseInt(host.split(":").filter(Boolean)[0] || "0", 16);
  return (firstGroup & 0xfe00) === 0xfc00
    || (firstGroup & 0xffc0) === 0xfe80
    || (firstGroup & 0xff00) === 0xff00
    || host.startsWith("2001:db8:");
}

function isAllowedPortalHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return net.isIP(host) === 0 && allowedDomains.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );
}

async function validateRequestUrl(rawUrl, resolveLookup = lookup) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("URL de navegação inválida.");
  }

  if (url.protocol !== "https:" || !isAllowedPortalHost(url.hostname) || isPrivateHost(url.hostname)) {
    throw new Error("Destino externo bloqueado pela política de navegação segura.");
  }

  const addresses = await resolveLookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((address) => isPrivateHost(address.address))) {
    throw new Error("Destino bloqueado: o domínio resolve para um endereço privado ou não público.");
  }

  return url;
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

    if (!isAllowedPortalHost(url.hostname) || isPrivateHost(url.hostname)) {
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
        try {
          await validateRequestUrl(route.request().url());
        } catch (error) {
          console.warn("Requisição do navegador bloqueada:", error.message);
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
  isPrivateHost,
  validateRequestUrl,
  startSession,
  stopSession,
  getSessionStatus
};
