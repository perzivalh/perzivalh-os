const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "";

function signUser(user) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET missing");
  }
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(token) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET missing");
  }
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signUser,
  verifyToken,
};
