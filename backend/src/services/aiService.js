const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
const MATCHING_STOP_WORDS = new Set([
  "para", "com", "uma", "das", "dos", "que", "por", "como", "mais", "sobre",
  "the", "and", "for", "with", "from", "this", "that", "will", "you", "your",
  "are", "our", "have", "has", "was", "who", "all", "not", "can", "able",
  "work", "team", "role", "job", "candidate", "experience", "years", "year",
  "required", "mandatory", "essential", "preferred", "must", "nice",
  "requisitos", "requisito", "experiencia", "anos", "vaga", "desejavel",
  "obrigatorio", "obrigatoria", "necessario", "necessaria", "diferencial",
  "ingles", "english", "espanhol", "spanish", "frances", "french", "alemao", "german",
  "avancado", "advanced", "fluente", "fluent", "proficiente", "proficient",
  "intermediario", "intermediate", "basico", "basic", "iniciante", "beginner"
]);
const REQUIRED_INDICATORS = /\b(?:must have|required|mandatory|essential|obrigatorio|obrigatoria|necessario|necessaria|imprescindivel|indispensavel|deve ter|requisito obrigatorio)\b/i;
const PREFERRED_INDICATORS = /\b(?:nice to have|preferred|preferencial|desejavel|diferencial|seria um diferencial)\b/i;

function normalizeText(value) {
  return String(value || "").trim();
}

function extractKeywords(jobDescription) {
  const text = normalizeText(jobDescription)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");

  const words = text.split(/\s+/).filter((word) => word.length > 3 && !MATCHING_STOP_WORDS.has(word));
  const unique = [...new Set(words)];

  return unique.slice(0, 12);
}

function normalizeForMatching(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ");
}

function tokenizeForMatching(value) {
  return normalizeForMatching(value)
    .split(/\s+/)
    .filter((word) => word.length > 2 && !MATCHING_STOP_WORDS.has(word));
}

function analyzeJobFit(jobDescription, candidateEvidence) {
  const segments = normalizeText(jobDescription)
    .split(/[\n;!?]+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const weightedTerms = new Map();

  for (const segment of segments) {
    const normalizedSegment = normalizeForMatching(segment);
    const priority = REQUIRED_INDICATORS.test(normalizedSegment)
      ? "required"
      : PREFERRED_INDICATORS.test(normalizedSegment)
        ? "preferred"
        : "general";
    const weight = priority === "required" ? 3 : priority === "preferred" ? 0.5 : 1;

    for (const term of new Set(tokenizeForMatching(normalizedSegment))) {
      const previous = weightedTerms.get(term);
      if (!previous || weight > previous.weight) {
        weightedTerms.set(term, { term, priority, weight });
      }
    }
  }

  const sources = Array.isArray(candidateEvidence)
    ? candidateEvidence.filter((source) => source && source.text)
    : [{ label: "Material informado", text: candidateEvidence }];
  const evidenceSourcesByTerm = new Map();
  for (const source of sources) {
    for (const term of new Set(tokenizeForMatching(source.text))) {
      const labels = evidenceSourcesByTerm.get(term) || [];
      labels.push(source.label || "Material informado");
      evidenceSourcesByTerm.set(term, labels);
    }
  }
  const matched = [];
  const evidence = [];
  const missingRequired = [];
  const missingPreferred = [];
  const missingOther = [];
  let totalWeight = 0;
  let matchedWeight = 0;

  for (const requirement of weightedTerms.values()) {
    totalWeight += requirement.weight;
    if (evidenceSourcesByTerm.has(requirement.term)) {
      matched.push(requirement.term);
      evidence.push({
        term: requirement.term,
        sources: [...new Set(evidenceSourcesByTerm.get(requirement.term))]
      });
      matchedWeight += requirement.weight;
    } else if (requirement.priority === "required") {
      missingRequired.push(requirement.term);
    } else if (requirement.priority === "preferred") {
      missingPreferred.push(requirement.term);
    } else {
      missingOther.push(requirement.term);
    }
  }

  const languages = analyzeLanguageRequirements(
    jobDescription,
    sources.map((source) => source.text).join("\n")
  );
  const weightedScore = totalWeight ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  const score = Math.max(0, Math.min(
    missingRequired.length || languages.gaps.length ? 69 : 100,
    weightedScore
  ));

  return {
    score,
    matched: matched.slice(0, 20),
    evidence: evidence.slice(0, 20),
    missingRequired: missingRequired.slice(0, 20),
    missingPreferred: missingPreferred.slice(0, 20),
    missingOther: missingOther.slice(0, 20),
    languages,
    basis: "Comparação textual heurística das palavras da vaga com as evidências fornecidas; não representa probabilidade de contratação."
  };
}

function findLanguageLevel(text, languagePattern) {
  const normalizedText = normalizeForMatching(text);
  const languageMatch = new RegExp(`\\b(?:${languagePattern})\\b`, "i").exec(normalizedText);
  if (!languageMatch) return null;

  const context = normalizedText.slice(
    Math.max(0, languageMatch.index - 45),
    Math.min(normalizedText.length, languageMatch.index + languageMatch[0].length + 45)
  );
  const levels = [
    { level: "advanced", rank: 3, pattern: /\b(?:advanced|fluent|proficient|avancado|fluente|proficiente|c1|c2|nativo)\b/ },
    { level: "intermediate", rank: 2, pattern: /\b(?:intermediate|intermediario|b1|b2)\b/ },
    { level: "basic", rank: 1, pattern: /\b(?:basic|basico|beginner|elementary|iniciante|a1|a2)\b/ }
  ];
  const matches = levels
    .map((entry) => ({ ...entry, index: context.search(entry.pattern) }))
    .filter((entry) => entry.index >= 0)
    .sort((left, right) => Math.abs(left.index - 45) - Math.abs(right.index - 45));

  return matches[0] || null;
}

function analyzeLanguageRequirements(jobDescription, candidateEvidence) {
  const languages = [
    { name: "inglês", pattern: "english|ingles" },
    { name: "espanhol", pattern: "spanish|espanol" },
    { name: "francês", pattern: "french|frances" },
    { name: "alemão", pattern: "german|alemao" }
  ];
  const matches = [];
  const gaps = [];

  for (const language of languages) {
    const required = findLanguageLevel(jobDescription, language.pattern);
    if (!required) continue;

    const candidate = findLanguageLevel(candidateEvidence, language.pattern);
    if (!candidate) {
      gaps.push(`${language.name}: a vaga exige nível ${required.level}, mas o nível do candidato não foi confirmado no currículo.`);
    } else if (candidate.rank < required.rank) {
      gaps.push(`${language.name}: a vaga exige nível ${required.level}; o currículo informa nível ${candidate.level}.`);
    } else {
      matches.push(`${language.name}: nível ${candidate.level} informado, compatível com o requisito ${required.level}.`);
    }
  }

  return { matches, gaps };
}

function buildFallbackResponse(profile, jobDescription) {
  const fullName = normalizeText(profile.fullName) || "Profissional";
  const jobTitle = normalizeText(profile.jobTitle) || normalizeText(profile.targetRole);
  const companyName = normalizeText(profile.companyName);
  const platform = normalizeText(profile.targetPlatform) || "LinkedIn";
  const summary = normalizeText(profile.summary);
  const candidateSkills = (Array.isArray(profile.skills)
    ? profile.skills
    : String(profile.skills || "").split(/[,;\n]/))
    .map(normalizeText)
    .filter(Boolean)
    .filter((skill, index, skills) => skills.indexOf(skill) === index);
  const candidateExperience = normalizeText(profile.experience);
  const originalResume = normalizeText(profile.resumeText);
  const candidateEvidence = [
    originalResume,
    profile.targetRole,
    summary,
    candidateExperience,
    JSON.stringify(profile.languages || []),
    ...candidateSkills
  ].filter(Boolean).join("\n");
  const links = [
    ["LinkedIn", normalizeText(profile.linkedin)],
    ["GitHub", normalizeText(profile.github)],
    ["Portfólio", normalizeText(profile.website)]
  ].filter(([, url]) => url);
  const evidenceSources = [
    { label: "Currículo importado", text: originalResume },
    { label: "Resumo informado", text: summary },
    { label: "Experiência informada", text: candidateExperience },
    { label: "Competências informadas", text: candidateSkills.join(" ") },
    { label: "Cargo alvo", text: profile.targetRole }
  ].filter((source) => normalizeText(source.text));
  const fitAnalysis = analyzeJobFit(jobDescription, evidenceSources);
  const languageAnalysis = fitAnalysis.languages;
  const score = fitAnalysis.score;
  const keywords = extractKeywords(`${jobDescription} ${jobTitle}`);
  const resumeSections = [
    `${fullName}${jobTitle ? ` | ${jobTitle}` : ""}`,
    ...[normalizeText(profile.email), normalizeText(profile.phone)].filter(Boolean),
    ...(links.length ? ["", ...links.map(([label, url]) => `${label}: ${url}`)] : []),
    ...(summary ? ["", "Resumo profissional", summary] : []),
    ...(jobTitle ? ["", `Objetivo profissional: ${jobTitle}`] : []),
    ...(candidateExperience ? ["", "Experiência profissional", candidateExperience] : []),
    ...(candidateSkills.length ? ["", "Competências informadas", candidateSkills.join(", ")] : []),
    ...(originalResume ? ["", "Conteúdo original do currículo", originalResume] : [])
  ];
  const resume = resumeSections.join("\n");

  const coverLetter = [
    `Prezado(a) time de recrutamento${companyName ? ` da ${companyName}` : ""},`,
    "",
    `Meu nome é ${fullName} e tenho interesse${jobTitle ? ` na oportunidade de ${jobTitle}` : " nesta oportunidade"}${companyName ? ` na ${companyName}` : ""}.`,
    candidateSkills.length
      ? `Entre as competências que informei estão ${candidateSkills.slice(0, 5).join(", ")}.`
      : "Gostaria de conversar sobre os requisitos da vaga e como minha experiência pode se relacionar a eles.",
    candidateExperience
      ? `Minha experiência profissional informada inclui: ${candidateExperience}`
      : originalResume
        ? "Minha experiência profissional está detalhada no currículo que acompanha esta apresentação."
        : "Meu histórico profissional não foi incluído nos dados informados; posso detalhá-lo durante a conversa.",
    "Tenho interesse em entender as prioridades da equipe e avaliar como posso contribuir com base nas competências e experiências descritas no meu currículo.",
    "",
    "Agradeço a consideração e fico à disposição para conversar sobre a oportunidade.",
    "",
    "Atenciosamente,",
    `${fullName}`
  ].join("\n");

  const actionPlan = [
    `1. Ajuste o título profissional para refletir a oportunidade${jobTitle ? ` de ${jobTitle}` : ""}${companyName ? ` na ${companyName}` : ""}.`,
    "2. Destaque projetos, métricas e ganhos de impacto em linguagem simples e objetiva, com foco em resultados mensuráveis.",
    `3. Revise o cadastro na plataforma ${platform} e evidencie apenas competências já localizadas: ${fitAnalysis.matched.slice(0, 5).join(", ") || "nenhuma correspondência confirmada até agora"}.`,
    `4. Confirme os requisitos ainda não comprovados antes de se candidatar${fitAnalysis.missingRequired.length ? `: ${fitAnalysis.missingRequired.slice(0, 5).join(", ")}` : "."}`
  ];

  const platformList = [
    "LinkedIn",
    "Indeed",
    "InfoJobs",
    "Glassdoor",
    "GitHub Jobs",
    "Remote OK",
    "We Work Remotely",
    "Catho"
  ];

  return {
    source: "local-fallback",
    status: "ready",
    model: DEFAULT_MODEL,
    score,
    keywords,
    resume,
    coverLetter,
    requirementsAnalysis: fitAnalysis,
    applicationPlan: actionPlan,
    platforms: platformList,
    targetPlatform: platform,
    jobTitle,
    companyName,
    jobPreferences: {
      remote: true,
      hybrid: true,
      onsite: true,
      maxDistanceKm: 40,
      worldWide: true,
      countries: "Brasil, Portugal, EUA, Canadá, Europa"
    },
    summary: {
      headline: `${fullName}${jobTitle ? ` · ${jobTitle}` : ""}`,
      match: fitAnalysis.basis,
      notes: [
        `Competências encontradas no material informado: ${fitAnalysis.matched.join(", ") || "nenhuma correspondência textual confirmada"}.`,
        ...(fitAnalysis.missingRequired.length ? [`Requisitos obrigatórios não localizados: ${fitAnalysis.missingRequired.join(", ")}.`] : []),
        ...(fitAnalysis.missingPreferred.length ? [`Diferenciais ainda não comprovados: ${fitAnalysis.missingPreferred.join(", ")}.`] : []),
        ...languageAnalysis.gaps,
        "Revise cada competência e afirmação antes de enviar a candidatura.",
        `Visão estratégica para candidaturas em ${platform}, com busca alinhada a vagas remotas, híbridas e presenciais.`
      ]
    }
  };
}

async function callOllama(profile, jobDescription) {
  const endpoint = process.env.OLLAMA_BASE_URL || "http://localhost:11434/api/generate";
  const prompt = `
Você é um especialista em recrutamento e carreira. Crie uma resposta em JSON válido com as chaves: score, keywords, resume, coverLetter, applicationPlan, summary.

Perfil do candidato:
${JSON.stringify(profile, null, 2)}

Descrição da vaga:
${jobDescription}

Regras:
- Use somente fatos fornecidos no perfil; não invente cargos, projetos, resultados, competências ou links.
- Separe palavras-chave da vaga de competências confirmadas do candidato.
- Quando faltarem informações, indique que devem ser completadas em vez de criar conteúdo.
- score deve ser um número de 0 a 100.
- keywords deve ser um array de strings em português e inglês relacionados à vaga.
- resume deve ser texto pronto para currículo, em português, objetivo, resumo e competências.
- coverLetter deve ser uma carta de apresentação profissional.
- applicationPlan deve ser um array com 4 ações práticas.
- summary deve ser um objeto com headline, match e notes.
- Retorne apenas JSON puro, sem markdown.
`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama respondeu com erro ${response.status}`);
    }

    const payload = await response.json();
    const rawText = payload.response || "{}";
    const parsed = JSON.parse(rawText);
    const verified = buildFallbackResponse(profile, jobDescription);

    return {
      ...verified,
      source: "ollama-assisted",
      status: "ready",
      model: DEFAULT_MODEL,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : verified.keywords,
      applicationPlan: Array.isArray(parsed.applicationPlan)
        ? parsed.applicationPlan
        : verified.applicationPlan
    };
  } catch (error) {
    return buildFallbackResponse(profile, jobDescription);
  }
}

async function generateProfileAssets(profile) {
  const jobDescription = profile.jobDescription || "";

  if (!profile || !profile.fullName) {
    throw new Error("O perfil do candidato é obrigatório.");
  }

  const normalizedProfile = {
    fullName: profile.fullName,
    targetRole: profile.targetRole || "",
    jobTitle: profile.jobTitle || profile.targetRole || "",
    companyName: profile.companyName || "",
    targetPlatform: profile.targetPlatform || "LinkedIn",
    summary: profile.summary || "",
    linkedin: profile.linkedin || "",
    github: profile.github || "",
    website: profile.website || "",
    email: profile.email || "",
    phone: profile.phone || "",
    experience: profile.experience || "",
    skills: profile.skills || [],
    resumeText: profile.resumeText || "",
    languages: profile.languages || [],
    jobDescription,
    platform: profile.targetPlatform || "LinkedIn"
  };

  return callOllama(normalizedProfile, jobDescription);
}

module.exports = {
  generateProfileAssets,
  buildFallbackResponse,
  extractKeywords,
  analyzeJobFit
};
