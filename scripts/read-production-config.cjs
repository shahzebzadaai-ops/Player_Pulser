const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const opsFile = path.join(root, "config", "production.json");
const secretsFile = path.join(root, "config", "secrets.production.json");

if (!fs.existsSync(opsFile)) {
  throw new Error("Missing config/production.json");
}
if (!fs.existsSync(secretsFile)) {
  throw new Error("Copy config/secrets.production.example.json to config/secrets.production.json and fill it in.");
}

const ops = readJson(opsFile);
const secrets = readJson(secretsFile);

if (!ops.canonicalUrl || String(ops.canonicalUrl).includes("example.com")) {
  throw new Error("Set domain and canonicalUrl in config/production.json to the real site.");
}
if (ops.mediaDirectory !== "/var/lib/playerpulser/media") {
  throw new Error("mediaDirectory must be /var/lib/playerpulser/media.");
}
if (ops.paymentProvider !== "simulated") {
  throw new Error("paymentProvider must stay simulated.");
}
if (ops.allowSimulatedPayments !== false) {
  throw new Error("allowSimulatedPayments must be false.");
}
if (ops.pricingEngineMode !== "SIMULATION") {
  throw new Error("pricingEngineMode must be SIMULATION.");
}
if (ops.pulsePreview !== false) {
  throw new Error("pulsePreview must be false.");
}
if (ops.realSourcePricing !== false) {
  throw new Error("realSourcePricing must be false.");
}
if (ops.metaPixel !== false || ops.gtm !== false) {
  throw new Error("metaPixel and gtm must be false.");
}
if (!secrets.databaseUrl || String(secrets.databaseUrl).includes("CHANGE_ME")) {
  throw new Error("Set databaseUrl in config/secrets.production.json.");
}
if (!secrets.authSecret || String(secrets.authSecret).includes("CHANGE_ME") || String(secrets.authSecret).length < 32) {
  throw new Error("Set authSecret in config/secrets.production.json to a random string of at least 32 characters.");
}

const env = {
  NODE_ENV: "production",
  DATABASE_URL: String(secrets.databaseUrl),
  AUTH_SECRET: String(secrets.authSecret),
  PAYMENT_PROVIDER: "simulated",
  ALLOW_SIMULATED_PAYMENTS: "false",
  OTP_PROVIDER: secrets.otpProvider ? String(secrets.otpProvider) : "simulated",
  PAYMENT_WEBHOOK_SECRET: secrets.paymentWebhookSecret ? String(secrets.paymentWebhookSecret) : "",
  PRICING_ENGINE_MODE: "SIMULATION",
  MEDIA_ROOT: "/var/lib/playerpulser/media",
  CANONICAL_URL: String(ops.canonicalUrl),
};

module.exports = { ops, env };
