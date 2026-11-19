const jobDiscoveryService = require("../services/jobDiscoveryService");
const { isAllowedJobUrl } = require("../services/jobSourceService");

const allowedSources = new Set(["Jobicy", "Remote OK"]);

function boundedText(value, field, maxLength, required = false) {
  const text = String(value || "").trim();
  if ((required && !text) || text.length > maxLength) {
    const error = new Error(`${field} é obrigatório e deve ter até ${maxLength} caracteres.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function sendError(res, error, fallbackMessage) {
  const status = error.statusCode || 500;
  if (status >= 500) {
    console.error(fallbackMessage, error.message);
  }
  return res.status(status).json({
    message: error.message || fallbackMessage
  });
}

exports.search = async (req, res) => {
  try {
    const result = await jobDiscoveryService.search(req.body?.profile || {}, req.user.id);
    return res.json(result);
  } catch (error) {
    return sendError(res, error, "Não foi possível buscar vagas nas fontes autorizadas.");
  }
};

exports.getDecisions = async (req, res) => {
  try {
    return res.json(await jobDiscoveryService.getDecisions(req.user.id));
  } catch (error) {
    return sendError(res, error, "Não foi possível carregar as vagas arquivadas.");
  }
};

exports.saveDecision = async (req, res) => {
  try {
    const body = req.body || {};
    const source = boundedText(body.source, "Fonte", 40, true);
    const sourceId = boundedText(body.sourceId, "Identificador da vaga", 100, true);
    const status = boundedText(body.status, "Status", 20, true);
    const title = boundedText(body.title, "Cargo", 250, true);
    const company = boundedText(body.company, "Empresa", 250, true);
    const jobUrl = boundedText(body.jobUrl, "Link da vaga", 1000, true);
    const description = boundedText(body.description, "Descrição da vaga", 40000, true);
    const resumeSnapshot = boundedText(body.resumeSnapshot, "Currículo ajustado", 60000);
    const coverLetterSnapshot = boundedText(body.coverLetterSnapshot, "Carta ajustada", 20000);

    if (!allowedSources.has(source) || !isAllowedJobUrl(source, jobUrl)) {
      return res.status(400).json({ message: "A fonte ou o endereço da vaga não é permitido." });
    }
    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Use o status accepted ou rejected." });
    }
    if (status === "accepted" && !resumeSnapshot) {
      return res.status(400).json({ message: "Gere e revise o currículo antes de arquivar a vaga em Aceitas." });
    }

    const fitScore = body.fitScore;
    if (!Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100) {
      return res.status(400).json({ message: "A aderência deve ser um inteiro entre 0 e 100." });
    }

    if (body.matchedTerms !== undefined && (!Array.isArray(body.matchedTerms) || body.matchedTerms.length > 50)) {
      return res.status(400).json({ message: "A lista de competências correspondentes é inválida." });
    }

    const matchedTerms = (body.matchedTerms || []).map((term) => boundedText(term, "Competência", 100));
    const decision = await jobDiscoveryService.saveDecision({
      source,
      sourceId,
      status,
      title,
      company,
      location: boundedText(body.location, "Localização", 250),
      jobUrl,
      description,
      excerpt: boundedText(body.excerpt, "Resumo da vaga", 1000),
      jobType: boundedText(body.jobType, "Tipo de vaga", 120),
      salary: boundedText(body.salary, "Salário", 120),
      fitScore,
      matchedTerms,
      resumeSnapshot,
      coverLetterSnapshot
    }, req.user.id);

    return res.status(200).json(decision);
  } catch (error) {
    return sendError(res, error, "Não foi possível arquivar a decisão sobre a vaga.");
  }
};
