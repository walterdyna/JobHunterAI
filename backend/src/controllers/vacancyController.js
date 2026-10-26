const vacancyService = require("../services/vacancyService");

exports.getAll = async (req, res) => {
  res.json(await vacancyService.getAll(req.user.id));
};

exports.getById = async (req, res) => {
  const vacancy = await vacancyService.getById(req.params.id, req.user.id);

  if (!vacancy) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.json(vacancy);
};

exports.create = async (req, res) => {
  const vacancy = await vacancyService.create(req.body, req.user.id);
  res.status(201).json(vacancy);
};

exports.update = async (req, res) => {
  const vacancy = await vacancyService.update(req.params.id, req.body, req.user.id);

  if (!vacancy) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.json(vacancy);
};

exports.delete = async (req, res) => {
  const removed = await vacancyService.delete(req.params.id, req.user.id);

  if (!removed) {
    return res.status(404).json({
      message: "Vaga nao encontrada"
    });
  }

  res.status(204).send();
};
