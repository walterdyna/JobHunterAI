const browserSessionService = require("./browserSessionService");

function normalizeUrls(rawUrls) {
  const urls = Array.isArray(rawUrls) ? rawUrls : String(rawUrls || "").split(/\n|,/) ;
  return urls
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function buildPlatformStrategy(platform, workModes, maxDistance, locations) {
  const baseConfig = {
    LinkedIn: {
      focus: "Relacionamento com recrutadores, matching de skills e perfil de experiência.",
      filters: [
        "Tipo de vaga: full-time, contractor, remoto ou híbrido",
        "Experiência: júnior, pleno ou sênior conforme alvo",
        "Foco em pessoas com experiência em produto, dados e automação"
      ],
      steps: [
        "Acesse o portal e filtre por função, país e modalidade de trabalho.",
        "Abra a vaga e confirme requisitos, senioridade, salário e modelo.",
        "Edite o perfil para mostrar resumo alinhado ao cargo e ao stack principal.",
        "Envie candidatura com carta personalizada e currículo adaptado.",
        "Salve a vaga no painel e acompanhe status e próximos passos."
      ]
    },
    Indeed: {
      focus: "Busca ampla, boa para rastrear volume e comparação de exigências.",
      filters: [
        "Remoto, híbrido ou presencial até a distância máxima selecionada",
        "Salário compatível com faixa alvo",
        "Palavras-chave: product, analytics, automation, growth, data"
      ],
      steps: [
        "Digite título e stack relevante no campo de busca.",
        "Aplique filtros de distância, tipo de contratação e salário.",
        "Revise anúncio e compare requisitos com perfil do candidato.",
        "Prepare mensagem específica e aplique na plataforma.",
        "Registre status em checklist para priorizar follow-up."
      ]
    },
    InfoJobs: {
      focus: "Candidaturas em massa com filtro por mercado e tipo de contrato.",
      filters: [
        "Remoto, híbrido ou presencial por cidade",
        "Região e distância até 40 km",
        "Contrato: CLT, PJ, temporário ou freelancer"
      ],
      steps: [
        "Busque pela palavra-chave principal da vaga.",
        "Selecione oportunidades com melhor aderência e salário compatível.",
        "Ajuste currículo para idioma e requisitos da vaga.",
        "Envie candidatura com foco em entrega de valor e resultados.",
        "Monitore status e agende follow-up semanal."
      ]
    },
    Glassdoor: {
      focus: "Reconhecimento de marca, salário, cultura e feedback de empresa.",
      filters: [
        "Empresa com cultura alinhada",
        "Salário e benefícios compatíveis",
        "Ambiente de trabalho e nível de senioridade"
      ],
      steps: [
        "Analise salário, avaliações e reputação da empresa.",
        "Confirme o escopo da vaga e a forma de contratação.",
        "Usar currículo com linguagem direcionada a resultados e mérito.",
        "Adaptar carta para mostrar fit cultural.",
        "Registrar estágio e próximos contatos."
      ]
    },
    "GitHub Jobs": {
      focus: "Soluções técnicas, produto digital e engenharia de dados.",
      filters: [
        "Role e stack relevantes",
        "Remoto, híbrido ou presencial na região",
        "Métricas e produto em foco"
      ],
      steps: [
        "Buscar vagas específicas por stack e área de atuação.",
        "Validar repositórios, níveis de senioridade e experiência.",
        "Ajustar portfolio e GitHub para reforçar fit técnico.",
        "Enviar mensagem curta e objetiva com perfil e impacto.",
        "Guardar contatos e rotinas de follow-up."
      ]
    },
    "Remote OK": {
      focus: "Vagas remotas e internacionais com foco em autonomia e produtividade.",
      filters: [
        "Trabalho remoto global",
        "Time distribuído e timezone compatível",
        "Vagas com flexibilidade e estrutura"
      ],
      steps: [
        "Filtrar por modalidade remota e timezone ideal.",
        "Validar salário e exigências de idioma.",
        "Reforçar autonomia, documentação e impacto em resultados.",
        "Enviar proposta clara em inglês ou no idioma da vaga.",
        "Registrar resposta e próximo passo por empresa."
      ]
    },
    "We Work Remotely": {
      focus: "Empresas remotas com foco em operação digital e cultura distribuída.",
      filters: [
        "Vagas 100% remotas",
        "Times globais e escala",
        "Escopo com impacto direto"
      ],
      steps: [
        "Verificar tipo de contrato e timezone.",
        "Ajustar descrição para mostrar capacidade global e autônoma.",
        "Destacar experiência em produto, métricas e entrega digital.",
        "Enviar aplicação com proposta de valor.",
        "Manter histórico de candidatura e follow-up."
      ]
    },
    default: {
      focus: "Fluxo universal para qualquer portal de empregos com foco em aderência e resposta rápida.",
      filters: [
        `Modalidades: ${workModes.join(", ") || "remotas e híbridas"}`,
        `Distância máxima: ${maxDistance} km`,
        `Regiões alvo: ${locations}`
      ],
      steps: [
        "Validar o papel, o salário e o nível de senioridade.",
        "Comparar requisitos com perfil e pontos fortes do candidato.",
        "Personalizar currículo e mensagem para a vaga.",
        "Aplicar em até 24h e registrar acompanhamento.",
        "Revisar e repetir o fluxo para as próximas oportunidades."
      ]
    }
  };

  return baseConfig[platform] || baseConfig.default;
}

function buildManualPlan(profile, urls, preferences = {}) {
  const jobPreferences = preferences || {};
  const platforms = Array.isArray(jobPreferences.preferredPlatforms) && jobPreferences.preferredPlatforms.length
    ? jobPreferences.preferredPlatforms
    : ["LinkedIn", "Indeed", "InfoJobs", "Glassdoor", "Remote OK", "We Work Remotely"];

  const workModes = [
    jobPreferences.remote ? "remotas" : null,
    jobPreferences.hybrid ? "híbridas" : null,
    jobPreferences.onsite ? "presenciais" : null
  ].filter(Boolean);

  const maxDistance = Number(jobPreferences.maxDistanceKm || 40);
  const locations = jobPreferences.locations || "Brasil, Portugal, EUA, Canadá, Europa";

  const platformChecklist = platforms.map((platform) => ({
    platform,
    ...buildPlatformStrategy(platform, workModes, maxDistance, locations),
    filters: buildPlatformStrategy(platform, workModes, maxDistance, locations).filters,
    steps: buildPlatformStrategy(platform, workModes, maxDistance, locations).steps
  }));

  return {
    status: "manual_plan_ready",
    mode: "manual_guided",
    profile: {
      fullName: profile.fullName || "Candidato",
      targetRole: profile.targetRole || "Cargo alvo",
      workModes,
      maxDistanceKm: maxDistance,
      locations
    },
    urls,
    platforms,
    platformChecklist,
    actions: [
      `1. Monitore ${platforms.join(", ")} e filtre vagas com foco em ${workModes.join(", ") || "remotas e híbridas"}.`,
      `2. Restringa a busca a até ${maxDistance} km de distância e inclua ${locations} como mercado alvo principal.`,
      "3. Abra cada vaga em LinkedIn, Indeed, InfoJobs, Glassdoor e outras plataformas relevantes para validar requisitos e skills exigidas.",
      "4. Aplique a mensagem personalizada gerada pela IA, ajuste o currículo para a vaga e envie a candidatura na plataforma correta.",
      "5. Registre cada envio, data, cargo e status para acompanhar candidaturas em carteira e priorizar as melhores oportunidades."
    ],
    message: "A automação local é segura e usa o ambiente do usuário. Caso o Playwright esteja instalado, o sistema consegue abrir o navegador e seguir os passos configurados; sem ele, o fluxo fica em modo manual orientado. O foco da busca inclui vagas remotas, híbridas e presenciais, com distância máxima de até 40 km e alcance global."
  };
}

async function runAutomation(profile = {}, urls = [], preferences = {}, userId) {
  const finalUrls = normalizeUrls(urls);

  if (!finalUrls.length) {
    return {
      status: "no_targets",
      message: "Informe pelo menos uma URL de vaga ou portal para iniciar a automação.",
      actions: []
    };
  }

  if (!userId) {
    throw new Error("É necessário autenticar para iniciar uma sessão de navegador.");
  }

  const browserResult = await browserSessionService.startSession(userId, finalUrls);
  const plan = buildManualPlan(profile, finalUrls, preferences);

  return {
    ...plan,
    ...browserResult,
    mode: "supervised_browser",
    message: browserResult.status === "already_running"
      ? "Sua sessão supervisionada já está aberta. Continue no navegador e faça login/preencha os formulários manualmente."
      : "As páginas foram abertas em um perfil de navegador local separado para sua conta. Faça login e revise cada candidatura; o envio permanece manual."
  };
}

module.exports = {
  runAutomation,
  buildManualPlan,
  getAutomationStatus: browserSessionService.getSessionStatus,
  stopAutomation: browserSessionService.stopSession
};
