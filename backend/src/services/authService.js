const users = [];

module.exports = {
  users,

  findByEmail(email) {
    return users.find(user => user.email === email);
  },

  create(user) {
    users.push(user);
    return user;
  }
};
