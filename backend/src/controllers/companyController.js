const companyService = require("../services/companyService");

exports.getAll = (req, res) => {
  res.json(companyService.getAll());
};

exports.getById = (req, res) => {
  const company = companyService.getById(req.params.id);

  if (!company) {
    return res.status(404).json({
      message: "Empresa nao encontrada"
    });
  }

  res.json(company);
};

exports.create = (req, res) => {
  const company = companyService.create(req.body);

  res.status(201).json(company);
};

exports.update = (req, res) => {
  const company = companyService.update(
    req.params.id,
    req.body
  );

  if (!company) {
    return res.status(404).json({
      message: "Empresa nao encontrada"
    });
  }

  res.json(company);
};

exports.delete = (req, res) => {
  const removed = companyService.delete(
    req.params.id
  );

  if (!removed) {
    return res.status(404).json({
      message: "Empresa nao encontrada"
    });
  }

  res.status(204).send();
};
