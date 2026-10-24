const { readJson, writeJson } = require("../utils/fileStore");

const companies = readJson("companies.json", []);

const persistCompanies = () => writeJson("companies.json", companies);

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
    persistCompanies();

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

    persistCompanies();
    return companies[index];
  },

  delete(id) {
    const index = companies.findIndex(
      c => c.id === Number(id)
    );

    if (index === -1) return false;

    companies.splice(index, 1);
    persistCompanies();

    return true;
  }
};
