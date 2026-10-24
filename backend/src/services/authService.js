const { readJson, writeJson } = require("../utils/fileStore");

const users = readJson("users.json", []);

const persistUsers = () => writeJson("users.json", users);

module.exports = {
  users,

  findByEmail(email) {
    return users.find(user => user.email === email);
  },

  create(user) {
    users.push(user);
    persistUsers();
    return user;
  }
};
