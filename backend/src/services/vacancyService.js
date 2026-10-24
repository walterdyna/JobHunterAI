const vacancies = [];

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

    return vacancies[index];
  },

  delete(id) {
    const index = vacancies.findIndex(
      v => v.id === Number(id)
    );

    if (index === -1) return false;

    vacancies.splice(index, 1);

    return true;
  }
};
