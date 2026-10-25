// Version en ligne de la surveillance, pour Cloudflare Workers.
// Cloudflare lance scheduled() toutes les 15 minutes (voir wrangler.toml).
// - Les réglages sont dans [vars] de wrangler.toml.
// - Les secrets (identifiants, Telegram, facteurs du QCM) sont dans les secrets Cloudflare.
// - L'état (cours vus, alertes déjà envoyées, erreurs) est dans le stockage KV « ETAT ».
import ed from "./ecoledirecte.js";
import d from "./detection.js";

const CLE_ETAT = "etat";

function enPauseNuit(env, maintenant) {
  const debut = Number(env.PAUSE_NUIT_DEBUT || 0);
  const fin = Number(env.PAUSE_NUIT_FIN || 6);
  const h = maintenant.getHours(); // heure de Paris grâce à heureParis()
  return debut > fin ? h >= debut || h < fin : h >= debut && h < fin;
}

async function verifier(env) {
  const maintenant = d.heureParis();
  if (enPauseNuit(env, maintenant)) return;

  const jours = Math.min(14, Math.max(1, Number(env.JOURS_A_SURVEILLER || 7)));
  const telegram = (texte) => d.envoyerTelegramAvec(env.TELEGRAM_TOKEN, env.TELEGRAM_CHAT_ID, texte);
  const enregistrer = (etat) => env.ETAT.put(CLE_ETAT, JSON.stringify(etat));
  const etat = (await env.ETAT.get(CLE_ETAT, "json")) || { signale: [], derniersCours: [] };

  try {
    // Pas de session gardée entre deux lancements : on se reconnecte à chaque fois,
    // avec les facteurs { cn, cv } du QCM pour qu'École Directe ne repose pas la question.
    const session = ed.nouvelleSession();
    const fa = env.ED_CN && env.ED_CV ? { cn: env.ED_CN, cv: env.ED_CV } : null;
    const rep = await ed.connexion(session, env.ED_IDENTIFIANT, env.ED_MOT_DE_PASSE, fa);
    if (rep.code === 250) {
      const err = new Error("École Directe redemande la question de sécurité. Relance configurer.js sur le PC, puis mets à jour ED_CN et ED_CV.");
      err.code = 250;
      throw err;
    }

    const debut = d.formatJour(maintenant);
    const fin = d.formatJour(d.ajouterJours(maintenant, jours - 1));
    const cours = await ed.emploiDuTemps(session, debut, fin);

    const minuit = new Date(maintenant);
    minuit.setHours(0, 0, 0, 0);
    const alertes = d.trouverAlertes(cours, etat, {
      maintenant,
      finFenetre: d.ajouterJours(minuit, jours),
      avecModifs: (env.ALERTER_MODIFICATIONS || "non").toLowerCase() === "oui",
    });

    for (const a of alertes) {
      await telegram(d.texteAlerte(a));
      etat.signale.push(a.cle);
      await enregistrer(etat); // tout de suite : pas de doublon si l'envoi suivant échoue
    }

    etat.signale = etat.signale.slice(-500);
    if (cours.length > 0) etat.derniersCours = cours.map(d.resumerCours); // liste vide = panne probable
    if (etat.alerteErreurEnvoyee) await telegram("✅ Le programme fonctionne de nouveau.");
    etat.erreursDeSuite = 0;
    etat.alerteErreurEnvoyee = false;
    etat.derniereVerification = new Date().toISOString();
    await enregistrer(etat);
    console.log(`OK : ${cours.length} cours vérifiés, ${alertes.length} nouvelle(s) alerte(s).`);
  } catch (err) {
    const msg = `${err && err.code ? "erreur " + err.code + " : " : ""}${err && (err.message || err)}`;
    console.log("Échec :", msg);
    etat.erreursDeSuite = (etat.erreursDeSuite || 0) + 1;
    // Après 3 échecs de suite, on prévient une seule fois sur Telegram.
    if (etat.erreursDeSuite >= 3 && !etat.alerteErreurEnvoyee) {
      try {
        await telegram(`⚠️ Le programme d'alertes n'arrive plus à vérifier ton emploi du temps.\n${msg}`);
        etat.alerteErreurEnvoyee = true;
      } catch (e) {
        console.log("Impossible de prévenir sur Telegram :", e.message);
      }
    }
    await enregistrer(etat);
  }
}

export default {
  async scheduled(controller, env, ctx) {
    await verifier(env);
  },
};
