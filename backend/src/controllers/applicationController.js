const applicationService = require("../services/applicationService");

exports.getAll = async (req, res) => {
  const applications = await applicationService.getAll(req.user.id);
  res.json(applications);
};

exports.create = async (req, res) => {
  const { resumeSnapshot, coverLetterSnapshot, fitScore } = req.body || {};
  if ((resumeSnapshot && String(resumeSnapshot).length > 60000)
    || (coverLetterSnapshot && String(coverLetterSnapshot).length > 20000)) {
    return res.status(400).json({ message: "O conteúdo dos documentos excede o limite permitido." });
  }
  if (fitScore !== undefined && (!Number.isInteger(fitScore) || fitScore < 0 || fitScore > 100)) {
    return res.status(400).json({ message: "O índice de aderência deve ser um inteiro entre 0 e 100." });
  }

  const payload = await applicationService.create(req.body, req.user.id);
  res.status(201).json(payload);
};

exports.updateStatus = async (req, res) => {
  const application = await applicationService.updateStatus(req.params.id, req.body.status, req.user.id);

  if (!application) {
    return res.status(404).json({ message: "Candidatura nao encontrada" });
  }

  return res.json(application);
};

exports.delete = async (req, res) => {
  const removed = await applicationService.delete(req.params.id, req.user.id);

  if (!removed) {
    return res.status(404).json({ message: "Candidatura nao encontrada" });
  }

  return res.status(204).send();
};
