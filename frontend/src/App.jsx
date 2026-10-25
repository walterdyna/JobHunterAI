import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";
import "./styles/ai-assistant.css";
import { generateCareerAssets, getAutomationStatus, runAutomation, stopAutomation } from "./services/jobhunterApi";

const API_URL = "http://localhost:3001";

const initialAuthForm = {
  name: "",
  email: "",
  password: ""
};

const initialCompanyForm = {
  name: "",
  city: ""
};

const initialVacancyForm = {
  title: "",
  company: "",
  salary: ""
};

const globalPlatforms = [
  "LinkedIn",
  "Indeed",
  "InfoJobs",
  "Glassdoor",
  "GitHub Jobs",
  "Remotive",
  "We Work Remotely",
  "Remote OK",
  "Workable",
  "Lever",
  "Greenhouse",
  "Catho"
];

const defaultAiProfile = {
  fullName: "",
  email: "",
  targetRole: "",
  summary: "",
  linkedin: "",
  github: "",
  website: "",
  companyName: "",
  jobTitle: "",
  targetPlatform: "LinkedIn",
  jobDescription: "",
  jobUrls: "https://www.linkedin.com/jobs\nhttps://www.infojobs.com.br/",
  resumeText: "",
  coverLetterText: "",
  jobPreferences: {
    remote: true,
    hybrid: true,
    onsite: true,
    maxDistanceKm: 40,
    worldWide: true,
    locations: "Brasil, Portugal, EUA, Canadá, Europa",
    preferredPlatforms: [...globalPlatforms]
  }
};

async function readImportedText(file) {
  if (!file) return "";
  const maxFileBytes = 10 * 1024 * 1024;

  if (file.size > maxFileBytes) {
    throw new Error(`${file.name} excede o limite de 10 MB.`);
  }

  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const chunks = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item) => item.str).join(" ");
      chunks.push(text);
    }

    const extractedText = chunks.join("\n").trim();
    if (!extractedText) {
      throw new Error("Este PDF não contém texto selecionável. Use um PDF pesquisável ou um arquivo .txt/.md.");
    }
    return extractedText;
  }

  if (!/\.(txt|md|csv|json)$/i.test(file.name)) {
    throw new Error("Formato não suportado para extração. Use PDF pesquisável, .txt, .md, .csv ou .json.");
  }

  return file.text();
}

function parseImportedProfile(rawText) {
  const text = String(rawText || "").replace(/\r/g, "");
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const urlMatches = Array.from(text.matchAll(/https?:\/\/[^\s]+/gi)).map((match) => match[0]);
  const linkedin = urlMatches.find((url) => url.toLowerCase().includes("linkedin.com")) || "";
  const github = urlMatches.find((url) => url.toLowerCase().includes("github.com")) || "";
  const website = urlMatches.find((url) => !url.toLowerCase().includes("linkedin.com") && !url.toLowerCase().includes("github.com")) || "";

  const fullName =
    lines.find((line) => /^(nome|name)\s*[:-]?/i.test(line))?.replace(/^(nome|name)\s*[:-]?\s*/i, "") ||
    lines.find((line) => !/https?:\/\//i.test(line) && !/@/.test(line) && line.length > 2 && line.length < 80) ||
    "";

  const summaryMatch = text.match(/(?:resumo|perfil|sobre|professional summary|summary)\s*[:-]?\s*([\s\S]{80,500})/i);
  const targetRoleMatch = text.match(/(?:cargo desejado|cargo alvo|objetivo profissional|position|role)\s*[:-]?\s*([^\n]{2,120})/i);
  const skillsMatch = text.match(/(?:compet[eê]ncias|habilidades|skills|stack)\s*[:-]?\s*([\s\S]{20,400})/i);
  const phoneMatch = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const experienceMatch = text.match(/(?:experi[eê]ncia profissional|professional experience|work experience)\s*[:-]?\s*([\s\S]{20,1200}?)(?=\n\s*(?:forma[cç][aã]o|educa[cç][aã]o|education|compet[eê]ncias|habilidades|skills|idiomas|languages|certifica[cç][oõ]es|$))/i);
  const languagesMatch = text.match(/(?:idiomas|languages)\s*[:-]?\s*([\s\S]{5,300}?)(?=\n\s*(?:certifica[cç][oõ]es|certifications|forma[cç][aã]o|educa[cç][aã]o|$))/i);

  const summary = summaryMatch ? summaryMatch[1].replace(/\n+/g, " ").trim() : "";
  const targetRole = targetRoleMatch ? targetRoleMatch[1].trim() : "";
  const experience = experienceMatch ? experienceMatch[1].trim() : "";
  const languages = languagesMatch
    ? languagesMatch[1].split(/[;,\n|]/).map((item) => item.trim()).filter(Boolean)
    : [];

  const skills = (() => {
    const source = skillsMatch ? skillsMatch[1] : "";
    const cleaned = source
      .replace(/\s*[:-]\s*/g, " ")
      .split(/[;,|\n]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 16);

    return cleaned;
  })();

  return {
    fullName: fullName.replace(/\s{2,}/g, " ").trim(),
    email: emailMatch ? emailMatch[0] : "",
    phone: phoneMatch ? phoneMatch[0].trim() : "",
    linkedin,
    github,
    website,
    summary,
    targetRole,
    experience,
    skills,
    languages,
    resumeText: text,
    coverLetterText: text
  };
}

function App() {
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [companyForm, setCompanyForm] = useState(initialCompanyForm);
  const [vacancyForm, setVacancyForm] = useState(initialVacancyForm);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [editingVacancyId, setEditingVacancyId] = useState(null);
  const [companySearch, setCompanySearch] = useState("");
  const [vacancySearch, setVacancySearch] = useState("");
  const [token, setToken] = useState(() => localStorage.getItem("jobhunter_token") || "");
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("jobhunter_user");
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [companies, setCompanies] = useState([]);
  const [vacancies, setVacancies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [aiProfile, setAiProfile] = useState({
    ...defaultAiProfile,
    jobPreferences: {
      ...defaultAiProfile.jobPreferences
    },
    fullName: user?.name || "",
    email: user?.email || ""
  });
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationResult, setAutomationResult] = useState(null);
  const [uploadedResumes, setUploadedResumes] = useState([]);
  const [pendingProfileImport, setPendingProfileImport] = useState(null);
  const [applications, setApplications] = useState([]);
  const [resumeFileName, setResumeFileName] = useState("Nenhum currículo selecionado");
  const [coverLetterFileName, setCoverLetterFileName] = useState("Nenhuma carta selecionada");
  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("all");

  const jobPreferences = aiProfile?.jobPreferences || defaultAiProfile.jobPreferences || {};
  const authHeaders = useMemo(
    () => token ? { Authorization: `Bearer ${token}` } : {},
    [token]
  );

  const filteredCompanies = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((company) =>
      `${company.name} ${company.city}`.toLowerCase().includes(query)
    );
  }, [companies, companySearch]);

  const filteredVacancies = useMemo(() => {
    const query = vacancySearch.trim().toLowerCase();
    if (!query) return vacancies;
    return vacancies.filter((vacancy) =>
      `${vacancy.title} ${vacancy.company} ${vacancy.salary}`.toLowerCase().includes(query)
    );
  }, [vacancies, vacancySearch]);

  const totalCompensation = useMemo(
    () => vacancies.reduce((sum, vacancy) => sum + Number(vacancy.salary || 0), 0),
    [vacancies]
  );

  const vacancyComparison = useMemo(() => {
    const keywords = (aiProfile.summary + " " + aiProfile.jobDescription + " " + aiProfile.targetRole)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .reduce((accumulator, word) => {
        accumulator[word] = (accumulator[word] || 0) + 1;
        return accumulator;
      }, {});

    const keys = Object.keys(keywords);

    return vacancies
      .map((vacancy) => {
        const text = `${vacancy.title} ${vacancy.company}`.toLowerCase();
        const score = Math.min(100, Math.max(30, Math.round(
          (keys.filter((key) => text.includes(key)).length / Math.max(keys.length, 1)) * 100
        )));

        return {
          ...vacancy,
          matchScore: score,
          fit: score >= 75 ? "Alta aderência" : score >= 50 ? "Boa aderência" : "Ajustar perfil"
        };
      })
      .sort((left, right) => right.matchScore - left.matchScore);
  }, [aiProfile, vacancies]);

  const filteredApplications = useMemo(() => {
    const query = applicationSearch.trim().toLowerCase();

    return applications.filter((application) => {
      const matchesStatus = applicationStatusFilter === "all" || application.status === applicationStatusFilter;
      const haystack = `${application.title} ${application.company} ${application.platform} ${application.notes || ""}`.toLowerCase();
      const matchesQuery = !query || haystack.includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [applicationSearch, applicationStatusFilter, applications]);

  const applicationStatusCounts = useMemo(() => {
    return {
      all: applications.length,
      pending: applications.filter((application) => application.status === "Pendente").length,
      sent: applications.filter((application) => application.status === "CV enviado").length,
      interview: applications.filter((application) => application.status === "Entrevista").length,
      rejected: applications.filter((application) => application.status === "Rejeitado").length,
      accepted: applications.filter((application) => application.status === "Aceito").length
    };
  }, [applications]);

  const platformModules = useMemo(() => {
    const preferredPlatforms = jobPreferences.preferredPlatforms?.length
      ? jobPreferences.preferredPlatforms
      : globalPlatforms.slice(0, 4);

    return preferredPlatforms.slice(0, 4).map((platform, index) => ({
      platform,
      focus: index % 2 === 0
        ? "Filtros por senioridade, salário e aderência ao cargo."
        : "Checklist de envio, follow-up e atualização de status.",
      lead: index === 0 ? "Prioridade alta" : index === 1 ? "Prioridade média" : "Ativação rápida"
    }));
  }, [jobPreferences.preferredPlatforms]);

  useEffect(() => {
    localStorage.setItem("jobhunter_applications", JSON.stringify(applications));
  }, [applications]);

  const logout = useCallback(() => {
    setToken("");
    setUser(null);
    setAuthForm(initialAuthForm);
    setCompanies([]);
    setVacancies([]);
    setApplications([]);
    setError("");
    setSuccess("");
    localStorage.removeItem("jobhunter_token");
    localStorage.removeItem("jobhunter_user");
  }, []);

  const loadCompanies = useCallback(async () => {
    const response = await axios.get(`${API_URL}/api/companies`, {
      headers: authHeaders
    });
    setCompanies(response.data);
  }, [authHeaders]);

  const loadVacancies = useCallback(async () => {
    const response = await axios.get(`${API_URL}/api/vacancies`, {
      headers: authHeaders
    });
    setVacancies(response.data);
  }, [authHeaders]);

  const fetchApplications = useCallback(async () => {
    if (!token) return;

    const response = await axios.get(`${API_URL}/api/applications`, {
      headers: authHeaders
    });
    setApplications(response.data || []);
  }, [authHeaders, token]);

  const fetchDashboardData = useCallback(async () => {
    if (!token) return;

    try {
      const userResponse = await axios.get(`${API_URL}/api/auth/me`, {
        headers: authHeaders
      });
      setUser(userResponse.data);
      localStorage.setItem("jobhunter_user", JSON.stringify(userResponse.data));
      await Promise.all([loadCompanies(), loadVacancies(), fetchApplications()]);
    } catch (errorResponse) {
      if (errorResponse.response?.status === 401) {
        logout();
      } else {
        setError(errorResponse.response?.data?.message || "Não foi possível carregar os dados do painel.");
      }
    }
  }, [authHeaders, fetchApplications, loadCompanies, loadVacancies, logout, token]);

  useEffect(() => {
    if (!token) return undefined;

    let isCurrent = true;
    const timer = window.setTimeout(() => {
      if (isCurrent) void fetchDashboardData();
    }, 0);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [fetchDashboardData, token]);

  useEffect(() => {
    if (!token) return undefined;

    let isCurrent = true;
    getAutomationStatus({ headers: { Authorization: `Bearer ${token}` } })
      .then((data) => {
        if (isCurrent && data.status === "running") {
          setAutomationResult({
            ...data,
            mode: "supervised_browser",
            message: "Sua sessão supervisionada continua aberta. Faça login, revise cada candidatura e envie manualmente."
          });
        }
      })
      .catch((errorResponse) => {
        if (isCurrent) {
          setError(errorResponse.response?.data?.message || "Não foi possível verificar a sessão do navegador.");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  const handleAuthChange = (event) => {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
  };

  const handleCompanyChange = (event) => {
    const { name, value } = event.target;
    setCompanyForm((current) => ({ ...current, [name]: value }));
  };

  const handleVacancyChange = (event) => {
    const { name, value } = event.target;
    setVacancyForm((current) => ({ ...current, [name]: value }));
  };

  const handleProfileImport = async (event, kind) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      if (files.length > 10) {
        throw new Error("Importe no máximo 10 arquivos por vez.");
      }

      const importedDocuments = [];
      const importedTexts = [];
      for (const file of files) {
        const text = await readImportedText(file);
        importedTexts.push(text);
        importedDocuments.push({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name,
          type: kind,
          text,
          createdAt: new Date().toISOString()
        });
      }

      const combinedText = importedTexts.join("\n\n");
      setPendingProfileImport({
        kind,
        documents: importedDocuments,
        profile: kind === "resume"
          ? { ...parseImportedProfile(combinedText), resumeText: combinedText }
          : { coverLetterText: combinedText }
      });
      setSuccess("Revise os dados extraídos antes de aplicá-los ao perfil.");
    } catch (importError) {
      console.error(importError);
      setError(importError.message || "Não foi possível ler o arquivo importado. Use um PDF ou arquivo de texto legível.");
    }

    event.target.value = "";
  };

  const handleImportedProfileChange = (event) => {
    const { name, value } = event.target;
    setPendingProfileImport((current) => current ? {
      ...current,
      profile: {
        ...current.profile,
        [name]: name === "skills" || name === "languages"
          ? value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean)
          : value
      }
    } : current);
  };

  const confirmProfileImport = () => {
    if (!pendingProfileImport) return;

    const { kind, documents, profile } = pendingProfileImport;
    setUploadedResumes((current) => [...documents, ...current].slice(0, 10));

    if (kind === "resume") {
      setResumeFileName(documents.map((document) => document.name).join(", "));
      setAiProfile((current) => ({
        ...current,
        ...Object.fromEntries(Object.entries(profile).filter(([key, value]) =>
          key === "resumeText" || (Array.isArray(value) ? value.length > 0 : Boolean(value))
        )),
        jobTitle: current.jobTitle || profile.targetRole || "",
        jobPreferences: current.jobPreferences || defaultAiProfile.jobPreferences
      }));
    } else {
      setCoverLetterFileName(documents.map((document) => document.name).join(", "));
      setAiProfile((current) => ({ ...current, coverLetterText: profile.coverLetterText }));
    }

    setPendingProfileImport(null);
    setAiResult(null);
    setSuccess(kind === "resume"
      ? "Currículo revisado e aplicado ao perfil."
      : "Carta importada e aplicada ao perfil.");
  };

  const handlePreferenceToggle = (key) => {
    setAiProfile((current) => ({
      ...current,
      jobPreferences: {
        ...defaultAiProfile.jobPreferences,
        ...(current.jobPreferences || {}),
        [key]: !(current.jobPreferences?.[key] ?? defaultAiProfile.jobPreferences[key])
      }
    }));
  };

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const endpoint = authMode === "register"
        ? `${API_URL}/api/auth/register`
        : `${API_URL}/api/auth/login`;

      const payload = authMode === "register"
        ? authForm
        : {
            email: authForm.email,
            password: authForm.password
          };

      const response = await axios.post(endpoint, payload);

      if (authMode === "register") {
        setSuccess("Cadastro realizado com sucesso. Faça login agora.");
        setAuthMode("login");
        setAuthForm({ ...initialAuthForm, email: authForm.email });
        return;
      }

      const nextToken = response.data.token;
      const userResponse = await axios.get(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${nextToken}` }
      });
      setUser(userResponse.data);
      setAiProfile((current) => ({
        ...current,
        fullName: userResponse.data.name || current.fullName,
        email: userResponse.data.email || current.email
      }));
      setToken(nextToken);
      localStorage.setItem("jobhunter_token", nextToken);
      localStorage.setItem("jobhunter_user", JSON.stringify(userResponse.data));
      setSuccess("Login realizado com sucesso.");
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível completar a operação.");
    } finally {
      setLoading(false);
    }
  };

  const handleCompanySubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (editingCompanyId) {
        const response = await axios.put(`${API_URL}/api/companies/${editingCompanyId}`, companyForm, {
          headers: authHeaders
        });
        setCompanies((current) => current.map((company) => company.id === editingCompanyId ? response.data : company));
        setSuccess("Empresa atualizada com sucesso.");
      } else {
        const response = await axios.post(`${API_URL}/api/companies`, companyForm, {
          headers: authHeaders
        });
        setCompanies((current) => [response.data, ...current]);
        setSuccess("Empresa adicionada com sucesso.");
      }

      setCompanyForm(initialCompanyForm);
      setEditingCompanyId(null);
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível salvar a empresa.");
    }
  };

  const startEditCompany = (company) => {
    setCompanyForm({ name: company.name, city: company.city });
    setEditingCompanyId(company.id);
  };

  const cancelEditCompany = () => {
    setEditingCompanyId(null);
    setCompanyForm(initialCompanyForm);
  };

  const removeCompany = async (companyId) => {
    setError("");
    setSuccess("");

    try {
      await axios.delete(`${API_URL}/api/companies/${companyId}`, {
        headers: authHeaders
      });
      setCompanies((current) => current.filter((company) => company.id !== companyId));
      setSuccess("Empresa removida com sucesso.");
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível remover a empresa.");
    }
  };

  const handleVacancySubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (editingVacancyId) {
        const response = await axios.put(`${API_URL}/api/vacancies/${editingVacancyId}`, vacancyForm, {
          headers: authHeaders
        });
        setVacancies((current) => current.map((vacancy) => vacancy.id === editingVacancyId ? response.data : vacancy));
        setSuccess("Vaga atualizada com sucesso.");
      } else {
        const response = await axios.post(`${API_URL}/api/vacancies`, vacancyForm, {
          headers: authHeaders
        });
        setVacancies((current) => [response.data, ...current]);
        setSuccess("Vaga adicionada com sucesso.");
      }

      setVacancyForm(initialVacancyForm);
      setEditingVacancyId(null);
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível salvar a vaga.");
    }
  };

  const startEditVacancy = (vacancy) => {
    setVacancyForm({
      title: vacancy.title,
      company: vacancy.company,
      salary: vacancy.salary
    });
    setEditingVacancyId(vacancy.id);
  };

  const cancelEditVacancy = () => {
    setEditingVacancyId(null);
    setVacancyForm(initialVacancyForm);
  };

  const removeVacancy = async (vacancyId) => {
    setError("");
    setSuccess("");

    try {
      await axios.delete(`${API_URL}/api/vacancies/${vacancyId}`, {
        headers: authHeaders
      });
      setVacancies((current) => current.filter((vacancy) => vacancy.id !== vacancyId));
      setSuccess("Vaga removida com sucesso.");
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível remover a vaga.");
    }
  };

  const handleAiInput = (event) => {
    const { name, value } = event.target;
    setAiProfile((current) => ({ ...current, [name]: value }));
    setAiResult(null);
  };

  const handleGenerateProfile = async () => {
    setAiLoading(true);
    setError("");
    setAiResult(null);

    try {
      const data = await generateCareerAssets(aiProfile);
      setAiResult(data);
      setSuccess("A IA montou o currículo e a carta de apresentação.");
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível gerar o conteúdo com a IA local.");
    } finally {
      setAiLoading(false);
    }
  };

  const handleRunAutomation = async () => {
    setAutomationLoading(true);
    setAutomationResult(null);
    setError("");

    try {
      const urls = aiProfile.jobUrls
        .split(/\n|,/)
        .map((value) => value.trim())
        .filter(Boolean);

      const preferences = {
        ...defaultAiProfile.jobPreferences,
        ...(aiProfile?.jobPreferences || {}),
        maxDistanceKm: Number(aiProfile?.jobPreferences?.maxDistanceKm || 40),
        preferredPlatforms: aiProfile?.jobPreferences?.preferredPlatforms?.length
          ? aiProfile.jobPreferences.preferredPlatforms
          : globalPlatforms
      };

      const data = await runAutomation({
        profile: { ...aiProfile, jobPreferences: preferences },
        urls,
        preferences
      }, {
        headers: authHeaders
      });
      setAutomationResult(data);
      setSuccess(data.status === "already_running"
        ? "Sua sessão do navegador já está aberta."
        : "Navegador aberto. Revise e envie cada candidatura manualmente.");
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível preparar a automação.");
    } finally {
      setAutomationLoading(false);
    }
  };

  const handleStopAutomation = async () => {
    try {
      await stopAutomation({ headers: authHeaders });
      setAutomationResult((current) => current ? { ...current, status: "stopped" } : current);
      setSuccess("Sessão de automação encerrada.");
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível encerrar a sessão do navegador.");
    }
  };

  const saveApplication = async (vacancy, status = "Pendente") => {
    const targetTitle = (aiProfile.jobTitle || aiProfile.targetRole || "").trim();
    const matchesGeneratedAssets = aiResult
      && targetTitle
      && targetTitle.toLowerCase() === vacancy.title.trim().toLowerCase()
      && (!aiProfile.companyName || aiProfile.companyName.trim().toLowerCase() === vacancy.company.trim().toLowerCase());
    const payload = {
      title: vacancy.title,
      company: vacancy.company,
      salary: Number(vacancy.salary || 0),
      status,
      platform: aiProfile.targetPlatform || jobPreferences.preferredPlatforms?.[0] || "LinkedIn",
      notes: `Candidatura para ${vacancy.title} em ${vacancy.company}. Cargo: ${aiProfile.jobTitle || aiProfile.targetRole}. Plataforma: ${aiProfile.targetPlatform || "LinkedIn"}.`,
      resumeSnapshot: matchesGeneratedAssets ? aiResult.resume : "",
      coverLetterSnapshot: matchesGeneratedAssets ? aiResult.coverLetter : "",
      fitScore: matchesGeneratedAssets && Number.isInteger(aiResult.score) ? aiResult.score : undefined
    };

    try {
      const response = await axios.post(`${API_URL}/api/applications`, payload, {
        headers: authHeaders
      });
      setApplications((current) => [response.data, ...current]);
      setSuccess(`Candidatura salva em ${vacancy.company} com status ${status}.`);
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível registrar a candidatura.");
    }
  };

  const updateApplicationStatus = async (applicationId, nextStatus) => {
    try {
      const response = await axios.patch(`${API_URL}/api/applications/${applicationId}/status`, { status: nextStatus }, {
        headers: authHeaders
      });
      setApplications((current) => current.map((application) => application.id === applicationId ? response.data : application));
    } catch (errorResponse) {
      setError(errorResponse.response?.data?.message || "Não foi possível atualizar o status.");
    }
  };

  const exportText = (fileName, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportApplicationsCsv = () => {
    const rows = [
      ["Cargo", "Empresa", "Plataforma", "Status", "Salário", "Criado em", "Observações"],
      ...filteredApplications.map((application) => [
        application.title,
        application.company,
        application.platform || "LinkedIn",
        application.status,
        Number(application.salary || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        new Date(application.created_at || Date.now()).toLocaleDateString("pt-BR"),
        application.notes || ""
      ])
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    exportText("historico-candidaturas-jobhunter.csv", csv);
  };

  const exportApplicationDocument = (application, kind) => {
    const content = kind === "resume" ? application.resume_snapshot : application.cover_letter_snapshot;
    if (!content) return;
    const safeName = `${application.company}-${application.title}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const label = kind === "resume" ? "curriculo" : "carta";
    exportText(`${label}-${safeName || application.id}.txt`, content);
  };

  const exportPrintableDocument = (title, content) => {
    const newWindow = window.open("", "_blank", "width=900,height=1200");

    if (!newWindow) {
      setError("O navegador bloqueou a janela de exportação. Permita pop-ups e tente novamente.");
      return;
    }

    const documentContent = content || "Documento indisponível.";
    newWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; line-height: 1.6; }
            h1 { font-size: 24px; margin-bottom: 12px; }
            .meta { color: #475569; margin-bottom: 20px; }
            pre { white-space: pre-wrap; word-break: break-word; background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 12px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="meta">Exportado pelo JobHunter AI · ${new Date().toLocaleString("pt-BR")}</div>
          <pre>${String(documentContent).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </body>
      </html>
    `);
    newWindow.document.close();
    newWindow.focus();
    setTimeout(() => newWindow.print(), 300);
  };

  const handleExportAsset = (kind, format = "txt") => {
    if (!aiResult && !aiProfile.resumeText && !aiProfile.coverLetterText) {
      setError("Primeiro gere ou importe o currículo e a carta de apresentação.");
      return;
    }

    const resumeContent = aiResult?.resume || aiProfile.resumeText || aiProfile.summary || "Currículo não disponível.";
    const coverContent = aiResult?.coverLetter || aiProfile.coverLetterText || aiProfile.summary || "Carta não disponível.";

    if (format === "pdf") {
      if (kind === "resume") {
        exportPrintableDocument("Currículo — JobHunter AI", resumeContent);
        return;
      }

      exportPrintableDocument("Carta de apresentação — JobHunter AI", coverContent);
      return;
    }

    if (kind === "resume") {
      exportText("curriculo-jobhunter.txt", resumeContent);
      return;
    }

    exportText("carta-apresentacao-jobhunter.txt", coverContent);
  };

  if (!token || !user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand-box">
            <span className="brand-badge">JobHunter AI</span>
            <h1>Conecte seu processo de contratação</h1>
            <p>
              Acompanhe empresas, vagas, currículo e automação em um mesmo painel.
            </p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="tab-row">
              <button
                type="button"
                className={authMode === "login" ? "tab active" : "tab"}
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                type="button"
                className={authMode === "register" ? "tab active" : "tab"}
                onClick={() => setAuthMode("register")}
              >
                Cadastrar
              </button>
            </div>

            {authMode === "register" && (
              <label>
                <span>Nome</span>
                <input
                  name="name"
                  value={authForm.name}
                  onChange={handleAuthChange}
                  placeholder="Seu nome"
                  required
                />
              </label>
            )}

            <label>
              <span>E-mail</span>
              <input
                type="email"
                name="email"
                value={authForm.email}
                onChange={handleAuthChange}
                placeholder="seu@email.com"
                required
              />
            </label>

            <label>
              <span>Senha</span>
              <input
                type="password"
                name="password"
                value={authForm.password}
                onChange={handleAuthChange}
                placeholder="Sua senha"
                required
              />
            </label>

            {error && <div className="message error">{error}</div>}
            {success && <div className="message success">{success}</div>}

            <button type="submit" className="primary-button" disabled={loading}>
              {loading ? "Carregando..." : authMode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">JobHunter AI</p>
          <h1>Painel do candidato</h1>
        </div>

        <button type="button" className="secondary-button" onClick={logout}>
          Sair
        </button>
      </header>

      <main className="dashboard-grid">
        <section className="panel spotlight-panel">
          <div className="panel-header">
            <h2>Resumo</h2>
            <span className="status-chip online">online</span>
          </div>

          <div className="user-box">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>

          <div className="stats-grid">
            <div className="stat-card accent-card">
              <span>Empresas</span>
              <strong>{companies.length}</strong>
            </div>
            <div className="stat-card accent-card">
              <span>Vagas</span>
              <strong>{vacancies.length}</strong>
            </div>
            <div className="stat-card">
              <span>Salário bruto</span>
              <strong>R$ {Number(totalCompensation || 0).toLocaleString("pt-BR")}</strong>
            </div>
            <div className="stat-card">
              <span>Candidaturas</span>
              <strong>{applications.length}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Empresas</h2>
            <span className="mini-count">{filteredCompanies.length} itens</span>
          </div>

          <form className="compact-form" onSubmit={handleCompanySubmit}>
            <input
              name="name"
              value={companyForm.name}
              onChange={handleCompanyChange}
              placeholder="Nome da empresa"
              required
            />
            <input
              name="city"
              value={companyForm.city}
              onChange={handleCompanyChange}
              placeholder="Cidade"
              required
            />
            <button type="submit" className="primary-button small">
              {editingCompanyId ? "Salvar" : "Adicionar"}
            </button>
            {editingCompanyId && (
              <button type="button" className="ghost-button small" onClick={cancelEditCompany}>
                Cancelar
              </button>
            )}
          </form>

          <div className="search-wrap">
            <input
              value={companySearch}
              onChange={(event) => setCompanySearch(event.target.value)}
              placeholder="Buscar empresa ou cidade"
            />
          </div>

          <ul className="item-list">
            {filteredCompanies.length === 0 ? (
              <li className="empty-state">Nenhuma empresa cadastrada.</li>
            ) : (
              filteredCompanies.map((company) => (
                <li key={company.id}>
                  <div>
                    <strong>{company.name}</strong>
                    <span>{company.city}</span>
                  </div>
                  <div className="actions">
                    <button type="button" className="ghost-button" onClick={() => startEditCompany(company)}>
                      Editar
                    </button>
                    <button type="button" className="danger-button" onClick={() => removeCompany(company.id)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel wide">
          <div className="panel-header">
            <h2>Vagas</h2>
            <span className="mini-count">{filteredVacancies.length} itens</span>
          </div>

          <form className="compact-form vacancy-form" onSubmit={handleVacancySubmit}>
            <input
              name="title"
              value={vacancyForm.title}
              onChange={handleVacancyChange}
              placeholder="Título da vaga"
              required
            />
            <input
              name="company"
              value={vacancyForm.company}
              onChange={handleVacancyChange}
              placeholder="Empresa"
              required
            />
            <input
              type="number"
              name="salary"
              value={vacancyForm.salary}
              onChange={handleVacancyChange}
              placeholder="Salário"
              required
            />
            <button type="submit" className="primary-button small">
              {editingVacancyId ? "Salvar" : "Adicionar"}
            </button>
            {editingVacancyId && (
              <button type="button" className="ghost-button small" onClick={cancelEditVacancy}>
                Cancelar
              </button>
            )}
          </form>

          <div className="search-wrap">
            <input
              value={vacancySearch}
              onChange={(event) => setVacancySearch(event.target.value)}
              placeholder="Buscar vaga, empresa ou salário"
            />
          </div>

          <ul className="item-list">
            {filteredVacancies.length === 0 ? (
              <li className="empty-state">Nenhuma vaga cadastrada.</li>
            ) : (
              filteredVacancies.map((vacancy) => (
                <li key={vacancy.id}>
                  <div>
                    <strong>{vacancy.title}</strong>
                    <span>{vacancy.company} · R$ {Number(vacancy.salary || 0).toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="actions">
                    <button type="button" className="ghost-button" onClick={() => startEditVacancy(vacancy)}>
                      Editar
                    </button>
                    <button type="button" className="danger-button" onClick={() => removeVacancy(vacancy.id)}>
                      Excluir
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="panel ai-panel">
          <div className="panel-header">
            <h2>IA para candidatura</h2>
            <span className="mini-count">gratis e local</span>
          </div>

          <div className="import-grid">
            <label className="upload-box">
              <span>Currículo (CV)</span>
              <strong>Selecionar arquivo do currículo</strong>
              <input type="file" multiple accept=".txt,.md,.csv,.json,.pdf" onChange={(event) => handleProfileImport(event, "resume")} />
              <small>{resumeFileName}</small>
            </label>
            <label className="upload-box">
              <span>Carta de apresentação</span>
              <strong>Selecionar arquivo da carta</strong>
              <input type="file" multiple accept=".txt,.md,.pdf" onChange={(event) => handleProfileImport(event, "cover")} />
              <small>{coverLetterFileName}</small>
            </label>
          </div>

          <div className="ai-grid">
            <div className="ai-field">
              <label>Nome completo</label>
              <input name="fullName" value={aiProfile.fullName} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>E-mail</label>
              <input name="email" value={aiProfile.email} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>Telefone</label>
              <input name="phone" value={aiProfile.phone || ""} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>Cargo alvo</label>
              <input name="targetRole" value={aiProfile.targetRole} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>Vaga / cargo da candidatura</label>
              <input name="jobTitle" value={aiProfile.jobTitle} onChange={handleAiInput} placeholder="Ex.: Product Analyst Senior" />
            </div>
            <div className="ai-field">
              <label>Empresa da vaga</label>
              <input name="companyName" value={aiProfile.companyName} onChange={handleAiInput} placeholder="Ex.: Nubank" />
            </div>
            <div className="ai-field">
              <label>Plataforma alvo</label>
              <select name="targetPlatform" value={aiProfile.targetPlatform} onChange={handleAiInput}>
                {globalPlatforms.map((platform) => (
                  <option key={platform} value={platform}>{platform}</option>
                ))}
              </select>
            </div>
            <div className="ai-field">
              <label>LinkedIn</label>
              <input name="linkedin" value={aiProfile.linkedin} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>GitHub</label>
              <input name="github" value={aiProfile.github} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>Site pessoal</label>
              <input name="website" value={aiProfile.website} onChange={handleAiInput} />
            </div>
            <div className="ai-field">
              <label>Competências confirmadas (separadas por vírgula)</label>
              <input
                name="skills"
                value={Array.isArray(aiProfile.skills) ? aiProfile.skills.join(", ") : aiProfile.skills || ""}
                onChange={handleAiInput}
              />
            </div>
            <div className="ai-field">
              <label>Idiomas e níveis</label>
              <input
                name="languages"
                value={Array.isArray(aiProfile.languages) ? aiProfile.languages.join(", ") : aiProfile.languages || ""}
                onChange={handleAiInput}
                placeholder="Ex.: Inglês básico, Espanhol intermediário"
              />
            </div>
          </div>

          <div className="ai-field">
            <label>Resumo profissional</label>
            <textarea name="summary" value={aiProfile.summary} onChange={handleAiInput} placeholder="Inclua um resumo fiel ao seu histórico e aos seus objetivos." />
          </div>

          <div className="ai-field">
            <label>Experiência profissional comprovada</label>
            <textarea name="experience" value={aiProfile.experience || ""} onChange={handleAiInput} placeholder="Cargos, projetos e resultados exatamente como informados no currículo." />
          </div>

          <div className="ai-field">
            <label>Descrição da vaga</label>
            <textarea name="jobDescription" value={aiProfile.jobDescription} onChange={handleAiInput} />
          </div>

          <div className="preferences-grid">
            <div className="toggle-row">
              <button type="button" className={jobPreferences.remote ? "pill active" : "pill"} onClick={() => handlePreferenceToggle("remote")}>Remotas</button>
              <button type="button" className={jobPreferences.hybrid ? "pill active" : "pill"} onClick={() => handlePreferenceToggle("hybrid")}>Híbridas</button>
              <button type="button" className={jobPreferences.onsite ? "pill active" : "pill"} onClick={() => handlePreferenceToggle("onsite")}>Presenciais</button>
            </div>

            <label className="distance-field">
              <span>Distância máxima</span>
              <input
                type="number"
                min="0"
                max="200"
                value={jobPreferences.maxDistanceKm}
                onChange={(event) => setAiProfile((current) => ({
                  ...current,
                  jobPreferences: {
                    ...defaultAiProfile.jobPreferences,
                    ...(current.jobPreferences || {}),
                    maxDistanceKm: Number(event.target.value || 40)
                  }
                }))}
              />
            </label>
          </div>

          <div className="platform-grid">
            {globalPlatforms.map((platform) => (
              <button
                key={platform}
                type="button"
                className={(jobPreferences.preferredPlatforms || []).includes(platform) ? "platform-badge active" : "platform-badge"}
                onClick={() => {
                  setAiProfile((current) => {
                    const existing = current.jobPreferences?.preferredPlatforms || defaultAiProfile.jobPreferences.preferredPlatforms;
                    const next = existing.includes(platform)
                      ? existing.filter((item) => item !== platform)
                      : [...existing, platform];

                    return {
                      ...current,
                      jobPreferences: {
                        ...defaultAiProfile.jobPreferences,
                        ...(current.jobPreferences || {}),
                        preferredPlatforms: next
                      }
                    };
                  });
                }}
              >
                {platform}
              </button>
            ))}
          </div>

          <div className="ai-field">
            <label>URLs de busca ou vagas (até 6 por sessão)</label>
            <textarea name="jobUrls" value={aiProfile.jobUrls} onChange={handleAiInput} />
            <small className="automation-note">
              Abre um navegador local separado e mantém sua sessão ativa por até 2 horas. Você faz login, revisa e envia as candidaturas manualmente.
            </small>
          </div>

          <div className="ai-actions">
            <button type="button" className="primary-button" onClick={handleGenerateProfile} disabled={aiLoading}>
              {aiLoading ? "Gerando..." : "Gerar currículo + carta"}
            </button>
            <button type="button" className="secondary-button" onClick={handleRunAutomation} disabled={automationLoading}>
              {automationLoading ? "Preparando..." : "Preparar automação"}
            </button>
          </div>

          {platformModules.length > 0 && (
            <div className="platform-module-grid">
              {platformModules.map((module) => (
                <article key={module.platform} className="platform-module-card">
                  <span className="module-chip">{module.lead}</span>
                  <strong>{module.platform}</strong>
                  <p>{module.focus}</p>
                </article>
              ))}
            </div>
          )}

          {(error || success) && (
            <div className={error ? "message error" : "message success"}>{error || success}</div>
          )}

          {pendingProfileImport && (
            <section className="import-review ai-output">
              <div>
                <h3>Revise antes de importar</h3>
                <p>Confira os campos extraídos. Nada será aplicado ao perfil até você confirmar.</p>
                <ul>
                  {pendingProfileImport.documents.map((document) => (
                    <li key={document.id}>{document.name}</li>
                  ))}
                </ul>
              </div>
              {pendingProfileImport.kind === "resume" ? (
                <div className="ai-grid">
                  {[
                    ["fullName", "Nome completo"],
                    ["email", "E-mail"],
                    ["phone", "Telefone"],
                    ["targetRole", "Cargo alvo"]
                  ].map(([name, label]) => (
                    <div className="ai-field" key={name}>
                      <label>{label}</label>
                      <input name={name} value={pendingProfileImport.profile[name] || ""} onChange={handleImportedProfileChange} />
                    </div>
                  ))}
                  <div className="ai-field">
                    <label>Competências extraídas (separadas por vírgula)</label>
                    <input name="skills" value={(pendingProfileImport.profile.skills || []).join(", ")} onChange={handleImportedProfileChange} />
                  </div>
                  <div className="ai-field">
                    <label>Idiomas extraídos (separados por vírgula)</label>
                    <input name="languages" value={(pendingProfileImport.profile.languages || []).join(", ")} onChange={handleImportedProfileChange} />
                  </div>
                  <div className="ai-field">
                    <label>Resumo extraído</label>
                    <textarea name="summary" value={pendingProfileImport.profile.summary || ""} onChange={handleImportedProfileChange} />
                  </div>
                  <div className="ai-field">
                    <label>Experiência extraída</label>
                    <textarea name="experience" value={pendingProfileImport.profile.experience || ""} onChange={handleImportedProfileChange} />
                  </div>
                </div>
              ) : (
                <div className="ai-field">
                  <label>Texto da carta importada</label>
                  <textarea name="coverLetterText" value={pendingProfileImport.profile.coverLetterText || ""} onChange={handleImportedProfileChange} />
                </div>
              )}
              <div className="ai-actions">
                <button type="button" className="primary-button" onClick={confirmProfileImport}>Confirmar importação</button>
                <button type="button" className="secondary-button" onClick={() => setPendingProfileImport(null)}>Descartar</button>
              </div>
            </section>
          )}

          {aiResult && (
            <div className="ai-output">
              <div>
                <h3>Resumo da aderência</h3>
                <p>Índice de correspondência textual: {aiResult.score ?? "-"}/100</p>
                <small>{aiResult.summary?.match} Requisitos não comprovados devem ser confirmados pelo candidato.</small>
              </div>

              <div>
                <h4>Palavras-chave da vaga</h4>
                <div className="ai-pills">
                  {(aiResult.keywords || []).map((word) => (
                    <span key={word} className="ai-pill">{word}</span>
                  ))}
                </div>
              </div>

              {aiResult.requirementsAnalysis && (
                <div>
                  {aiResult.requirementsAnalysis.matched?.length > 0 && (
                    <>
                      <h4>Termos encontrados no material enviado</h4>
                      <div className="ai-pills">
                        {aiResult.requirementsAnalysis.matched.map((item) => (
                          <span key={item} className="ai-pill">{item}</span>
                        ))}
                      </div>
                    </>
                  )}
                  {aiResult.requirementsAnalysis.evidence?.length > 0 && (
                    <div className="fit-evidence-list">
                      <h4>Origem das correspondências</h4>
                      {aiResult.requirementsAnalysis.evidence.map(({ term, sources }) => (
                        <p key={term}><strong>{term}</strong> — {sources.join(", ")}</p>
                      ))}
                    </div>
                  )}
                  {aiResult.requirementsAnalysis.missingRequired?.length > 0 && (
                    <>
                      <h4>Requisitos obrigatórios não localizados</h4>
                      <p className="message error">{aiResult.requirementsAnalysis.missingRequired.join(", ")}</p>
                    </>
                  )}
                  {aiResult.requirementsAnalysis.missingPreferred?.length > 0 && (
                    <>
                      <h4>Diferenciais ainda não comprovados</h4>
                      <p>{aiResult.requirementsAnalysis.missingPreferred.join(", ")}</p>
                    </>
                  )}
                  {(aiResult.requirementsAnalysis.languages?.matches?.length > 0
                    || aiResult.requirementsAnalysis.languages?.gaps?.length > 0) && (
                    <>
                      <h4>Requisitos de idioma</h4>
                      {aiResult.requirementsAnalysis.languages.matches.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                      {aiResult.requirementsAnalysis.languages.gaps.map((item) => (
                        <p className="message error" key={item}>{item}</p>
                      ))}
                    </>
                  )}
                  {aiResult.summary?.notes?.map((item) => <p key={item}>{item}</p>)}
                </div>
              )}

              <div>
                <h4>Currículo</h4>
                <pre>{aiResult.resume || "Currículo não disponível."}</pre>
              </div>

              <div>
                <h4>Carta de apresentação</h4>
                <pre>{aiResult.coverLetter || "Carta não disponível."}</pre>
              </div>

              <div>
                <h4>Plano de ação</h4>
                <pre>{(aiResult.applicationPlan || []).join("\n")}</pre>
              </div>
            </div>
          )}

          {(aiResult || automationResult || uploadedResumes.length > 0) && (
            <div className="download-row">
              <button type="button" className="secondary-button" onClick={() => handleExportAsset("resume", "pdf")}>
                Exportar currículo em PDF
              </button>
              <button type="button" className="secondary-button" onClick={() => handleExportAsset("cover", "pdf")}>
                Exportar carta em PDF
              </button>
              <button type="button" className="ghost-button" onClick={() => handleExportAsset("resume", "txt")}>
                .txt
              </button>
              <button type="button" className="ghost-button" onClick={() => handleExportAsset("cover", "txt")}>
                .txt
              </button>
            </div>
          )}

          {uploadedResumes.length > 0 && (
            <div className="uploaded-files">
              <h3>Arquivos importados</h3>
              <ul>
                {uploadedResumes.map((file) => (
                  <li key={file.id}>
                    <strong>{file.name}</strong>
                    <span>{file.type === "resume" ? "Currículo" : "Carta"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {vacancyComparison.length > 0 && (
            <div className="comparison-panel">
              <h3>Comparação de vagas</h3>
              <div className="comparison-grid">
                {vacancyComparison.slice(0, 4).map((vacancy) => (
                  <article key={vacancy.id} className="comparison-card">
                    <div>
                      <strong>{vacancy.title}</strong>
                      <span>{vacancy.company}</span>
                    </div>
                    <div className="comparison-meta">
                      <span className={vacancy.matchScore >= 75 ? "score-good" : vacancy.matchScore >= 50 ? "score-mid" : "score-low"}>
                        {vacancy.matchScore}%
                      </span>
                      <span>{vacancy.fit}</span>
                    </div>
                    <button type="button" className="primary-button small" onClick={() => saveApplication(vacancy)}>
                      Salvar candidatura
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {automationResult && (
            <div className="ai-output automation-output">
              <h3>Automação por plataforma</h3>
              <p>{automationResult.message}</p>
              {["browser_opened", "already_running", "running"].includes(automationResult.status) && (
                <div className="automation-session-bar">
                  <span>Sessão local: {automationResult.status === "already_running" ? "já aberta" : "ativa"}</span>
                  <button type="button" className="danger-button" onClick={handleStopAutomation}>
                    Encerrar navegador
                  </button>
                </div>
              )}

              {Array.isArray(automationResult.results) && automationResult.results.length > 0 && (
                <ul className="opened-pages-list">
                  {automationResult.results.map((page) => (
                    <li key={page.url}>
                      <a href={page.url} target="_blank" rel="noreferrer">
                        {page.title || page.url}
                      </a>
                      <span>{page.status === "opened" ? "Aberta no navegador" : page.status}</span>
                    </li>
                  ))}
                </ul>
              )}

              {Array.isArray(automationResult.platformChecklist) && (
                <div className="platform-plan-grid">
                  {automationResult.platformChecklist.map((platformPlan) => (
                    <div key={platformPlan.platform} className="platform-plan-card">
                      <div className="platform-plan-header">
                        <strong>{platformPlan.platform}</strong>
                        <span>{platformPlan.focus}</span>
                      </div>

                      {Array.isArray(platformPlan.filters) && (
                        <ul>
                          {platformPlan.filters.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      )}

                      {Array.isArray(platformPlan.steps) && (
                        <ol>
                          {platformPlan.steps.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <pre>
                {JSON.stringify({
                  status: automationResult.status,
                  mode: automationResult.mode,
                  profile: automationResult.profile,
                  platforms: automationResult.platforms,
                  urls: automationResult.urls
                }, null, 2)}
              </pre>
            </div>
          )}

          {applications.length > 0 && (
            <div className="applications-panel">
              <div className="applications-header">
                <div>
                  <h3>Checklist de candidaturas</h3>
                  <span className="mini-count">{applications.length} registros</span>
                </div>
                <div className="applications-toolbar">
                  <input
                    value={applicationSearch}
                    onChange={(event) => setApplicationSearch(event.target.value)}
                    placeholder="Buscar candidatura"
                  />
                  <select value={applicationStatusFilter} onChange={(event) => setApplicationStatusFilter(event.target.value)}>
                    <option value="all">Todos</option>
                    <option value="Pendente">Pendente</option>
                    <option value="CV enviado">CV enviado</option>
                    <option value="Entrevista">Entrevista</option>
                    <option value="Rejeitado">Rejeitado</option>
                    <option value="Aceito">Aceito</option>
                  </select>
                  <button type="button" className="secondary-button small" onClick={exportApplicationsCsv}>
                    Exportar histórico
                  </button>
                </div>
              </div>

              <div className="status-summary">
                <span>Pendente: {applicationStatusCounts.pending}</span>
                <span>CV: {applicationStatusCounts.sent}</span>
                <span>Entrevista: {applicationStatusCounts.interview}</span>
                <span>Aceito: {applicationStatusCounts.accepted}</span>
              </div>

              <ul className="application-list">
                {filteredApplications.map((application) => (
                  <li key={application.id} className="application-item">
                    <div className="application-main">
                      <div>
                        <strong>{application.title}</strong>
                        <span>{application.company} · {Number(application.salary || 0).toLocaleString("pt-BR")}</span>
                        <small>{application.platform || "LinkedIn"} · {application.created_at ? new Date(application.created_at).toLocaleDateString("pt-BR") : "Data indisponível"}</small>
                        {Number.isInteger(application.fit_score) && <small>Índice textual salvo: {application.fit_score}/100</small>}
                        {application.notes && <p>{application.notes}</p>}
                        {(application.resume_snapshot || application.cover_letter_snapshot) && (
                          <div className="application-documents">
                            {application.resume_snapshot && (
                              <button type="button" className="ghost-button" onClick={() => exportApplicationDocument(application, "resume")}>
                                Baixar currículo usado
                              </button>
                            )}
                            {application.cover_letter_snapshot && (
                              <button type="button" className="ghost-button" onClick={() => exportApplicationDocument(application, "cover")}>
                                Baixar carta usada
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="application-controls">
                      <span className="status-pill">{application.status}</span>
                      <select
                        value={application.status}
                        onChange={(event) => updateApplicationStatus(application.id, event.target.value)}
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="CV enviado">CV enviado</option>
                        <option value="Entrevista">Entrevista</option>
                        <option value="Rejeitado">Rejeitado</option>
                        <option value="Aceito">Aceito</option>
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
