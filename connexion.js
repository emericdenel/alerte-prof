// Connexion à École Directe avec la session enregistrée par configurer.js.
const ed = require("./ecoledirecte");
const { FICHIER_SESSION, lireJSON, exiger } = require("./lib");

async function seConnecter() {
  const enregistre = lireJSON(FICHIER_SESSION, null);
  if (!enregistre) {
    throw new Error("Pas de session enregistrée. Lance d'abord : node configurer.js");
  }
  const session = ed.nouvelleSession();
  // Avec les facteurs { cn, cv } enregistrés, École Directe ne repose normalement pas le QCM.
  const rep = await ed.connexion(session, exiger("ED_IDENTIFIANT"), exiger("ED_MOT_DE_PASSE"), enregistre.fa);
  if (rep.code === 250) {
    const err = new Error("École Directe redemande la question de sécurité. Relance : node configurer.js");
    err.code = 250;
    throw err;
  }
  return session;
}

module.exports = { seConnecter };
