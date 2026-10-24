const vacancyService = require("../services/vacancyService");

exports.getAll = (req, res) => {
  res.json(vacancyService.getAll());
};

exports.getById = (req, res) => {
  const vacancy = vacancyService.getById(req.params.id);

  if (!vacancy) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.json(vacancy);
};

exports.create = (req, res) => {
  const vacancy = vacancyService.create(req.body);

  res.status(201).json(vacancy);
};

exports.update = (req, res) => {
  const vacancy = vacancyService.update(
    req.params.id,
    req.body
  );

  if (!vacancy) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.json(vacancy);
};

exports.delete = (req, res) => {
  const removed = vacancyService.delete(
    req.params.id
  );

  if (!removed) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.status(204).send();
};
