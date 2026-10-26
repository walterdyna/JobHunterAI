const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authService = require("../services/authService");
const env = require("../config/environment");

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nome, e-mail e senha sao obrigatorios" });
  }

  const existingUser = await authService.findByEmail(email);

  if (existingUser) {
    return res.status(400).json({
      message: "Usuario ja existe"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await authService.create({
    name,
    email,
    password: hashedPassword
  });

  return res.status(201).json({
    id: user.id,
    name: user.name,
    email: user.email
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const user = await authService.findByEmail(email);

  if (!user) {
    return res.status(401).json({
      message: "Credenciais invalidas"
    });
  }

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) {
    return res.status(401).json({
      message: "Credenciais invalidas"
    });
  }

  const token = jwt.sign({
    id: user.id,
    name: user.name,
    email: user.email
  }, env.jwt.secret, {
    expiresIn: "12h"
  });

  return res.json({ token });
};

exports.me = async (req, res) => {
  return res.json({
    id: req.user.id,
    name: req.user.name,
    email: req.user.email
  });
};
