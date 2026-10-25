const vacancyService = require("../services/vacancyService");

exports.getAll = (req, res) => {
  res.json(vacancyService.getAll(req.user.id));
};

exports.getById = (req, res) => {
  const vacancy = vacancyService.getById(req.params.id, req.user.id);

  if (!vacancy) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.json(vacancy);
};

exports.create = (req, res) => {
  const vacancy = vacancyService.create(req.body, req.user.id);
  res.status(201).json(vacancy);
};

exports.update = (req, res) => {
  const vacancy = vacancyService.update(req.params.id, req.body, req.user.id);

  if (!vacancy) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.json(vacancy);
};

exports.delete = (req, res) => {
  const removed = vacancyService.delete(req.params.id, req.user.id);

  if (!removed) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.status(204).send();
};
