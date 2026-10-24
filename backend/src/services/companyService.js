const companies = [];

module.exports = {
  getAll() {
    return companies;
  },

  getById(id) {
    return companies.find(c => c.id === Number(id));
  },

  create(data) {
    const company = {
      id: Date.now(),
      ...data
    };

    companies.push(company);

    return company;
  },

  update(id, data) {
    const index = companies.findIndex(
      c => c.id === Number(id)
    );

    if (index === -1) return null;

    companies[index] = {
      ...companies[index],
      ...data
    };

    return companies[index];
  },

  delete(id) {
    const index = companies.findIndex(
      c => c.id === Number(id)
    );

    if (index === -1) return false;

    companies.splice(index, 1);

    return true;
  }
};
