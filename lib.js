// Fonctions pour le PC : configuration (.env), fichiers JSON, journal.
// La détection elle-même est dans detection.js (partagée avec Cloudflare).
const fs = require("fs");
const path = require("path");
const detection = require("./detection");

// Les heures d'École Directe sont en heure de Paris. On fixe ce fuseau pour que le programme
// marche aussi sur un serveur réglé en UTC (cas de presque tous les hébergeurs en ligne).
process.env.TZ = "Europe/Paris";

const DOSSIER = __dirname;
const FICHIER_SESSION = path.join(DOSSIER, "session.json"); // facteurs de double authentification { cn, cv }
const FICHIER_ETAT = path.join(DOSSIER, "etat.json");       // ce qui a déjà été signalé

// Lit le fichier .env (lignes CLE=valeur) sans bibliothèque externe.
function chargerEnv() {
  const fichier = path.join(DOSSIER, ".env");
  if (!fs.existsSync(fichier)) {
    throw new Error("Fichier .env introuvable. Copie .env.example en .env et remplis-le.");
  }
  for (const ligne of fs.readFileSync(fichier, "utf8").split(/\r?\n/)) {
    const propre = ligne.trim();
    if (!propre || propre.startsWith("#") || !propre.includes("=")) continue;
    const i = propre.indexOf("=");
    const cle = propre.slice(0, i).trim();
    let valeur = propre.slice(i + 1).trim();
    if ((valeur.startsWith('"') && valeur.endsWith('"')) || (valeur.startsWith("'") && valeur.endsWith("'"))) {
      valeur = valeur.slice(1, -1);
    }
    if (!(cle in process.env)) process.env[cle] = valeur;
  }
}

function exiger(nom) {
  const v = process.env[nom];
  if (!v) throw new Error(`La variable ${nom} est vide dans .env`);
  return v;
}

function lireJSON(fichier, defaut) {
  try {
    return JSON.parse(fs.readFileSync(fichier, "utf8"));
  } catch {
    return defaut;
  }
}

function ecrireJSON(fichier, donnees) {
  fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2), "utf8");
}

async function envoyerTelegram(texte) {
  await detection.envoyerTelegramAvec(exiger("TELEGRAM_TOKEN"), exiger("TELEGRAM_CHAT_ID"), texte);
}

function journal(...args) {
  const h = new Date().toLocaleString("fr-FR");
  console.log(`[${h}]`, ...args);
}

module.exports = {
  ...detection,
  FICHIER_SESSION, FICHIER_ETAT, chargerEnv, exiger, lireJSON, ecrireJSON,
  envoyerTelegram, journal,
};
