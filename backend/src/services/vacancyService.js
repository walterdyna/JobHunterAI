const { readJson, writeJson } = require("../utils/fileStore");

const vacancies = readJson("vacancies.json", []);

const persistVacancies = () => writeJson("vacancies.json", vacancies);

module.exports = {
  getAll() {
    return vacancies;
  },

  getById(id) {
    return vacancies.find(v => v.id === Number(id));
  },

  create(data) {
    const vacancy = {
      id: Date.now(),
      ...data
    };

    vacancies.push(vacancy);
    persistVacancies();

    return vacancy;
  },

  update(id, data) {
    const index = vacancies.findIndex(
      v => v.id === Number(id)
    );

    if (index === -1) return null;

    vacancies[index] = {
      ...vacancies[index],
      ...data
    };

    persistVacancies();
    return vacancies[index];
  },

  delete(id) {
    const index = vacancies.findIndex(
      v => v.id === Number(id)
    );

    if (index === -1) return false;

    vacancies.splice(index, 1);
    persistVacancies();

    return true;
  }
};
