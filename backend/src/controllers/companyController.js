const companyService = require("../services/companyService");

exports.getAll = async (req, res) => {
  res.json(await companyService.getAll(req.user.id));
};

exports.getById = async (req, res) => {
  const company = await companyService.getById(req.params.id, req.user.id);

  if (!company) {
    return res.status(404).json({
      message: "Empresa nao encontrada"
    });
  }

  res.json(company);
};

exports.create = async (req, res) => {
  const company = await companyService.create(req.body, req.user.id);
  res.status(201).json(company);
};

exports.update = async (req, res) => {
  const company = await companyService.update(req.params.id, req.body, req.user.id);

  if (!company) {
    return res.status(404).json({
      message: "Empresa nao encontrada"
    });
  }

  res.json(company);
};

exports.delete = async (req, res) => {
  const removed = await companyService.delete(req.params.id, req.user.id);

  if (!removed) {
    return res.status(404).json({
      message: "Empresa nao encontrada"
    });
  }

  res.status(204).send();
};
