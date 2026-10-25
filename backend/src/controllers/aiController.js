const aiService = require("../services/aiService");
const automationService = require("../services/automationService");

exports.generate = async (req, res) => {
  try {
    const payload = req.body || {};

    const output = await aiService.generateProfileAssets(payload);

    return res.json(output);
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Não foi possível gerar a proposta de candidatura."
    });
  }
};

exports.runAutomation = async (req, res) => {
  try {
    const { profile, urls, preferences } = req.body || {};
    const result = await automationService.runAutomation(profile || {}, urls || [], preferences || {}, req.user.id);

    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      message: error.message || "Não foi possível iniciar a automação."
    });
  }
};

exports.getAutomationStatus = (req, res) => {
  return res.json(automationService.getAutomationStatus(req.user.id));
};

exports.stopAutomation = async (req, res) => {
  try {
    return res.json(await automationService.stopAutomation(req.user.id));
  } catch (error) {
    return res.status(500).json({
      message: error.message || "Não foi possível encerrar a sessão do navegador."
    });
  }
};
