// Programme principal : vérifie l'emploi du temps régulièrement et prévient sur Telegram.
const {
  FICHIER_ETAT, chargerEnv, lireJSON, ecrireJSON, formatJour, ajouterJours,
  trouverAlertes, texteAlerte, resumerCours, envoyerTelegram, journal,
} = require("./lib");
const { seConnecter } = require("./connexion");
const { emploiDuTemps } = require("./ecoledirecte");

chargerEnv();
const MINUTES = Math.max(10, Number(process.env.INTERVALLE_MINUTES || 15)); // jamais moins de 10 min
const JOURS = Math.min(14, Math.max(1, Number(process.env.JOURS_A_SURVEILLER || 7)));
const AVEC_MODIFS = (process.env.ALERTER_MODIFICATIONS || "non").toLowerCase() === "oui";
const PAUSE_DEBUT = Number(process.env.PAUSE_NUIT_DEBUT || 0); // heure (une ligne vide = valeur par défaut)
const PAUSE_FIN = Number(process.env.PAUSE_NUIT_FIN || 6);

let ED = null;
let erreursDeSuite = 0;
let alerteErreurEnvoyee = false;

function enPauseNuit(d = new Date()) {
  const h = d.getHours();
  return PAUSE_DEBUT > PAUSE_FIN ? h >= PAUSE_DEBUT || h < PAUSE_FIN : h >= PAUSE_DEBUT && h < PAUSE_FIN;
}

async function recupererCours() {
  const aujourdHui = new Date();
  const debut = formatJour(aujourdHui);
  const fin = formatJour(ajouterJours(aujourdHui, JOURS - 1));
  if (!ED) ED = await seConnecter();
  try {
    return await emploiDuTemps(ED, debut, fin);
  } catch (err) {
    // Session expirée ou jeton invalide : on se reconnecte une fois et on réessaie.
    journal(`Requête refusée (${err && err.code}), reconnexion…`);
    ED = await seConnecter();
    return await emploiDuTemps(ED, debut, fin);
  }
}

let pauseAnnoncee = false;

// premiere = true au démarrage : on vérifie même la nuit, pour savoir tout de suite si ça marche.
async function verifier(premiere = false) {
  if (!premiere && enPauseNuit()) {
    if (!pauseAnnoncee) journal(`Pause de nuit, reprise à ${PAUSE_FIN}h.`);
    pauseAnnoncee = true;
    return;
  }
  pauseAnnoncee = false;
  try {
    const cours = await recupererCours();
    const etat = lireJSON(FICHIER_ETAT, { signale: [], derniersCours: [] });
    const minuit = new Date();
    minuit.setHours(0, 0, 0, 0);
    const alertes = trouverAlertes(cours, etat, {
      maintenant: new Date(),
      finFenetre: ajouterJours(minuit, JOURS),
      avecModifs: AVEC_MODIFS,
    });

    for (const a of alertes) {
      await envoyerTelegram(texteAlerte(a));
      etat.signale.push(a.cle);
      ecrireJSON(FICHIER_ETAT, etat); // enregistré tout de suite : pas de doublon si l'envoi suivant échoue
      journal("Alerte envoyée :", texteAlerte(a).replace("\n", " | "));
    }

    etat.signale = etat.signale.slice(-500); // on garde l'historique récent seulement
    if (cours.length > 0) etat.derniersCours = cours.map(resumerCours); // liste vide = panne probable, on garde l'ancienne
    else journal("École Directe a renvoyé un emploi du temps vide, on garde la version précédente.");
    etat.derniereVerification = new Date().toISOString();
    ecrireJSON(FICHIER_ETAT, etat);

    if (alerteErreurEnvoyee) await envoyerTelegram("✅ Le programme fonctionne de nouveau.");
    erreursDeSuite = 0;
    alerteErreurEnvoyee = false;
    journal(`OK : ${cours.length} cours vérifiés, ${alertes.length} nouvelle(s) alerte(s).`);
  } catch (err) {
    ED = null;
    erreursDeSuite++;
    const msg = err && err.code === 250
      ? "École Directe redemande la question de sécurité. Relance : node configurer.js"
      : `${err && err.code ? "erreur " + err.code + " : " : ""}${err && (err.message || err)}`;
    journal("Échec :", msg);
    // Après 3 échecs de suite, on prévient une seule fois sur Telegram.
    if (erreursDeSuite >= 3 && !alerteErreurEnvoyee) {
      try {
        await envoyerTelegram(`⚠️ Le programme d'alertes n'arrive plus à vérifier ton emploi du temps.\n${msg}`);
        alerteErreurEnvoyee = true;
      } catch (e) {
        journal("Impossible de prévenir sur Telegram :", e.message);
      }
    }
  }
}

journal(`Démarrage : vérification toutes les ${MINUTES} min sur ${JOURS} jours, pause entre ${PAUSE_DEBUT}h et ${PAUSE_FIN}h.`);
verifier(true);
setInterval(verifier, MINUTES * 60 * 1000);
