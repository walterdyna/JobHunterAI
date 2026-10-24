const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authService = require("../services/authService");

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  const existingUser = authService.findByEmail(email);

  if (existingUser) {
    return res.status(400).json({
      message: "Usuario ja existe"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = authService.create({
    id: Date.now(),
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

  const user = authService.findByEmail(email);

  if (!user) {
    return res.status(401).json({
      message: "Credenciais invalidas"
    });
  }

  const valid = await bcrypt.compare(
    password,
    user.password
  );

  if (!valid) {
    return res.status(401).json({
      message: "Credenciais invalidas"
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h"
    }
  );

  return res.json({ token });
};
