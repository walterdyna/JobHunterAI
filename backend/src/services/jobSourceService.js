function htmlToText(value, maxLength = 40000) {
  return String(value || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[\da-f]+|\d+);/gi, (match, code) => {
      const isHex = code[0].toLowerCase() === "x";
      const point = Number.parseInt(isHex ? code.slice(1) : code, isHex ? 16 : 10);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : " ";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isAllowedJobUrl(source, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;

  if (source === "Jobicy") {
    return url.hostname === "jobicy.com" && url.pathname.startsWith("/jobs/");
  }
  if (source === "Remote OK") {
    return url.hostname === "remoteok.com" && url.pathname.startsWith("/remote-jobs/");
  }
  return false;
}

function normalizeJob({
  source,
  id,
  title,
  company,
  location,
  url,
  description,
  excerpt,
  jobType,
  salary,
  publishedAt
}) {
  const sourceId = String(id || "").trim();
  const safeTitle = htmlToText(title, 250);
  const safeCompany = htmlToText(company, 250);
  const safeDescription = htmlToText(description || excerpt);

  if (!sourceId || !safeTitle || !safeCompany || !safeDescription || !isAllowedJobUrl(source, url)) {
    return null;
  }

  return {
    source,
    sourceId,
    title: safeTitle,
    company: safeCompany,
    location: htmlToText(location, 250) || "Remoto / não informado",
    jobUrl: new URL(url).toString(),
    description: safeDescription,
    excerpt: htmlToText(excerpt || description, 900),
    jobType: htmlToText(jobType, 120),
    salary: htmlToText(salary, 120),
    publishedAt: String(publishedAt || "")
  };
}

function normalizeJobicyFeed(payload) {
  if (!payload || !Array.isArray(payload.jobs)) {
    throw new Error("A resposta do Jobicy não contém uma lista de vagas válida.");
  }

  return {
    jobs: payload.jobs.map((job) => normalizeJob({
      source: "Jobicy",
      id: job.id,
      title: job.jobTitle,
      company: job.companyName,
      location: job.jobGeo,
      url: job.url,
      description: job.jobDescription,
      excerpt: job.jobExcerpt,
      jobType: Array.isArray(job.jobType) ? job.jobType.join(", ") : job.jobType,
      salary: job.salary || "",
      publishedAt: job.pubDate || job.publicationDate || job.created_at
    })).filter(Boolean),
    lastUpdated: String(payload.lastUpdate || "")
  };
}

function normalizeRemoteOkFeed(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("A resposta do Remote OK não contém uma lista de vagas válida.");
  }

  const jobs = payload.filter((job) => job && job.id && job.position).map((job) => {
    const salary = job.salary
      || (job.salary_min || job.salary_max
        ? `${job.salary_min || "?"} - ${job.salary_max || "?"}`
        : "");
    return normalizeJob({
      source: "Remote OK",
      id: job.id,
      title: job.position,
      company: job.company,
      location: job.location,
      url: job.url,
      description: job.description,
      excerpt: job.description,
      jobType: Array.isArray(job.tags) ? job.tags.join(", ") : "",
      salary,
      publishedAt: job.date
    });
  }).filter(Boolean);

  return {
    jobs,
    lastUpdated: jobs.reduce((latest, job) => (
      job.publishedAt > latest ? job.publishedAt : latest
    ), "")
  };
}

module.exports = {
  htmlToText,
  isAllowedJobUrl,
  normalizeJobicyFeed,
  normalizeRemoteOkFeed
};
