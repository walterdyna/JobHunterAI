const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "..", "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getFilePath(fileName) {
  ensureDataDir();
  return path.join(DATA_DIR, fileName);
}

function readJson(fileName, fallback = []) {
  const filePath = getFilePath(fileName);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }

  const fileContents = fs.readFileSync(filePath, "utf8");

  if (!fileContents.trim()) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }

  try {
    const parsed = JSON.parse(fileContents);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
    return fallback;
  }
}

function writeJson(fileName, data) {
  const filePath = getFilePath(fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return data;
}

module.exports = {
  readJson,
  writeJson
};
