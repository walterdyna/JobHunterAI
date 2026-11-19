const { all, get, run } = require("../config/database");
const { analyzeJobFit } = require("./aiService");
const {
  normalizeJobicyFeed,
  normalizeRemoteOkFeed
} = require("./jobSourceService");

const feedCacheMs = 60 * 60 * 1000;
const maxFeedBytes = 20 * 1024 * 1024;
const sources = [
  {
    id: "jobicy",
    name: "Jobicy",
    url: "https://jobicy.com/api/jobs?count=100",
    normalize: normalizeJobicyFeed
  },
  {
    id: "remoteok",
    name: "Remote OK",
    url: "https://remoteok.com/api",
    normalize: normalizeRemoteOkFeed
  }
];
const inFlightRefreshes = new Map();

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function unavailableError(message) {
  const error = new Error(message);
  error.statusCode = 502;
  return error;
}

function readCachedFeed(cacheRow) {
  if (!cacheRow || !cacheRow.fetched_at) return null;

  let feed;
  try {
    feed = JSON.parse(cacheRow.payload);
  } catch {
    throw new Error(`O cache da fonte ${cacheRow.source} está inválido.`);
  }

  if (!feed || !Array.isArray(feed.jobs)) {
    throw new Error(`O cache da fonte ${cacheRow.source} não contém vagas válidas.`);
  }
  return feed;
}

function isRecent(timestamp, now) {
  const parsed = Date.parse(timestamp || "");
  return Number.isFinite(parsed) && now - parsed < feedCacheMs;
}

async function requestFeed(source) {
  const response = await fetch(source.url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "JobHunterAI/1.0"
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw unavailableError(`${source.name} respondeu com HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxFeedBytes) {
    throw unavailableError(`${source.name} retornou uma resposta maior que o limite permitido.`);
  }

  let text;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxFeedBytes) {
          await reader.cancel();
          throw unavailableError(`${source.name} retornou uma resposta maior que o limite permitido.`);
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    text = Buffer.concat(chunks).toString("utf8");
  } else {
    text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxFeedBytes) {
      throw unavailableError(`${source.name} retornou uma resposta maior que o limite permitido.`);
    }
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw unavailableError(`A resposta de ${source.name} não é um JSON válido.`);
  }

  const normalized = source.normalize(Array.isArray(payload) ? payload.slice(0, 150) : payload);
  return {
    jobs: normalized.jobs.slice(0, 100),
    lastUpdated: normalized.lastUpdated || new Date().toISOString()
  };
}

async function saveFeedCache(sourceId, payload, fetchedAt, attemptedAt) {
  await run(
    `INSERT INTO job_feed_cache (source, payload, fetched_at, attempted_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source) DO UPDATE SET
       payload = excluded.payload,
       fetched_at = excluded.fetched_at,
       attempted_at = excluded.attempted_at`,
    [sourceId, JSON.stringify(payload), fetchedAt, attemptedAt]
  );
}

async function getSourceFeed(source, now = Date.now()) {
  const cacheRow = await get("SELECT * FROM job_feed_cache WHERE source = ?", [source.id]);
  const cachedFeed = readCachedFeed(cacheRow);
  const fetchedAtMs = Date.parse(cacheRow?.fetched_at || "");

  if (cachedFeed && Number.isFinite(fetchedAtMs) && now - fetchedAtMs < feedCacheMs) {
    return { ...cachedFeed, stale: false };
  }

  const pending = inFlightRefreshes.get(source.id);
  if (pending) return pending;

  if (isRecent(cacheRow?.attempted_at, now)) {
    if (cachedFeed) {
      return {
        ...cachedFeed,
        stale: true,
        warning: `${source.name} está indisponível; mostrando a última atualização salva.`
      };
    }
    throw unavailableError(`${source.name} foi consultado há menos de uma hora; tente novamente depois.`);
  }

  const attemptedAt = new Date(now).toISOString();
  const refresh = (async () => {
    const refreshClaim = await run(
      `INSERT INTO job_feed_cache (source, payload, fetched_at, attempted_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source) DO UPDATE SET attempted_at = excluded.attempted_at
       WHERE job_feed_cache.attempted_at IS NULL OR job_feed_cache.attempted_at <= ?`,
      [
        source.id,
        cacheRow?.payload || "[]",
        cacheRow?.fetched_at || null,
        attemptedAt,
        new Date(now - feedCacheMs).toISOString()
      ]
    );

    if (!refreshClaim.changes) {
      const currentCache = await get("SELECT * FROM job_feed_cache WHERE source = ?", [source.id]);
      const currentFeed = readCachedFeed(currentCache);
      if (currentFeed) {
        return {
          ...currentFeed,
          stale: true,
          warning: `${source.name} está sendo atualizado; mostrando a última atualização salva.`
        };
      }
      throw unavailableError(`${source.name} está sendo atualizado. Tente novamente em instantes.`);
    }

    try {
      const feed = await requestFeed(source);
      const fetchedAt = new Date().toISOString();
      await saveFeedCache(source.id, feed, fetchedAt, attemptedAt);
      return { ...feed, stale: false };
    } catch (error) {
      if (cachedFeed) {
        return {
          ...cachedFeed,
          stale: true,
          warning: `${source.name} está indisponível; mostrando a última atualização salva.`
        };
      }
      throw error;
    }
  })();
  inFlightRefreshes.set(source.id, refresh);

  try {
    return await refresh;
  } finally {
    if (inFlightRefreshes.get(source.id) === refresh) {
      inFlightRefreshes.delete(source.id);
    }
  }
}

function getSkills(value) {
  return (Array.isArray(value) ? value : String(value || "").split(/[,;\n]/))
    .map((skill) => String(skill || "").trim())
    .filter(Boolean)
    .slice(0, 100);
}

function buildCandidateEvidence(profile) {
  const skills = getSkills(profile.skills);
  const evidence = [
    { label: "Currículo importado", text: String(profile.resumeText || "").slice(0, 120000) },
    { label: "Resumo informado", text: String(profile.summary || "").slice(0, 10000) },
    { label: "Experiência informada", text: String(profile.experience || "").slice(0, 20000) },
    { label: "Competências confirmadas", text: skills.join(", ") },
    { label: "Cargo alvo", text: String(profile.targetRole || profile.jobTitle || "").slice(0, 250) },
    { label: "Idiomas informados", text: getSkills(profile.languages).join(", ") }
  ].filter((item) => item.text.trim());

  if (!evidence.length) {
    throw inputError("Importe o currículo ou informe competências antes de buscar vagas.");
  }
  return evidence;
}

function decisionKey(source, sourceId) {
  return `${source}:${sourceId}`;
}

async function search(profile, userId) {
  const candidateEvidence = buildCandidateEvidence(profile || {});
  const feeds = await Promise.all(sources.map(async (source) => {
    try {
      return { source, feed: await getSourceFeed(source) };
    } catch (error) {
      return { source, error };
    }
  }));
  const availableFeeds = feeds.filter((item) => item.feed);
  const warnings = feeds
    .filter((item) => item.error)
    .map(({ source, error }) => `${source.name}: ${error.message}`);
  warnings.push(...availableFeeds.map(({ feed }) => feed.warning).filter(Boolean));

  if (!availableFeeds.length) {
    throw unavailableError(warnings.join(" ") || "As fontes de vagas estão indisponíveis.");
  }

  const decisions = await all("SELECT source, source_id FROM job_leads WHERE user_id = ?", [userId]);
  const decided = new Set(decisions.map((item) => decisionKey(item.source, item.source_id)));
  const jobs = availableFeeds.flatMap(({ feed }) => feed.jobs)
    .filter((job) => !decided.has(decisionKey(job.source, job.sourceId)))
    .map((job) => {
      const fitAnalysis = analyzeJobFit(
        `${job.title}\n${job.description}\n${job.jobType}`,
        candidateEvidence
      );
      return {
        ...job,
        fitScore: fitAnalysis.score,
        matchedTerms: fitAnalysis.matched,
        missingRequired: fitAnalysis.missingRequired,
        matchBasis: fitAnalysis.basis
      };
    })
    .sort((left, right) => (
      right.fitScore - left.fitScore
      || right.publishedAt.localeCompare(left.publishedAt)
      || left.title.localeCompare(right.title)
    ))
    .slice(0, 30);

  return {
    jobs,
    sources: availableFeeds.map(({ source, feed }) => ({
      name: source.name,
      url: source.id === "jobicy" ? "https://jobicy.com/jobs-rss-feed" : "https://remoteok.com/",
      lastUpdated: feed.lastUpdated,
      stale: Boolean(feed.stale)
    })),
    warnings
  };
}

async function getDecisions(userId) {
  const rows = await all(
    "SELECT * FROM job_leads WHERE user_id = ? ORDER BY updated_at DESC",
    [userId]
  );
  return rows.map((row) => {
    let matchedTerms = [];
    try {
      matchedTerms = JSON.parse(row.matched_terms || "[]");
    } catch (error) {
      throw new Error(`Os termos correspondentes da vaga arquivada ${row.id} estão inválidos: ${error.message}`);
    }
    if (!Array.isArray(matchedTerms)) {
      throw new Error(`Os termos correspondentes da vaga arquivada ${row.id} estão inválidos.`);
    }
    return { ...row, matched_terms: matchedTerms };
  });
}

async function saveDecision(data, userId) {
  const now = new Date().toISOString();
  await run(
    `INSERT INTO job_leads (
      user_id, source, source_id, title, company, location, job_url, description,
      excerpt, job_type, salary, fit_score, matched_terms, status, resume_snapshot,
      cover_letter_snapshot, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, source, source_id) DO UPDATE SET
      title = excluded.title,
      company = excluded.company,
      location = excluded.location,
      job_url = excluded.job_url,
      description = excluded.description,
      excerpt = excluded.excerpt,
      job_type = excluded.job_type,
      salary = excluded.salary,
      fit_score = excluded.fit_score,
      matched_terms = excluded.matched_terms,
      status = excluded.status,
      resume_snapshot = excluded.resume_snapshot,
      cover_letter_snapshot = excluded.cover_letter_snapshot,
      updated_at = excluded.updated_at`,
    [
      userId,
      data.source,
      data.sourceId,
      data.title,
      data.company,
      data.location || "",
      data.jobUrl,
      data.description,
      data.excerpt || "",
      data.jobType || "",
      data.salary || "",
      data.fitScore,
      JSON.stringify(data.matchedTerms || []),
      data.status,
      data.resumeSnapshot || null,
      data.coverLetterSnapshot || null,
      now,
      now
    ]
  );

  return get(
    "SELECT * FROM job_leads WHERE user_id = ? AND source = ? AND source_id = ?",
    [userId, data.source, data.sourceId]
  );
}

module.exports = {
  search,
  getDecisions,
  saveDecision
};
