// Étape à faire une seule fois : connexion + question de sécurité (double authentification).
// Enregistre dans session.json ce qu'il faut pour se reconnecter sans reposer la question.
const readline = require("readline/promises");
const ed = require("./ecoledirecte");
const { FICHIER_SESSION, chargerEnv, exiger, ecrireJSON } = require("./lib");

async function main() {
  chargerEnv();
  const identifiant = exiger("ED_IDENTIFIANT");
  const motDePasse = exiger("ED_MOT_DE_PASSE");
  const session = ed.nouvelleSession();

  console.log("Connexion à École Directe…");
  const premiere = await ed.connexion(session, identifiant, motDePasse, null);
  if (premiere.code === 200) {
    ecrireJSON(FICHIER_SESSION, { fa: null });
    console.log("Connecté sans question de sécurité. Session enregistrée dans session.json.");
    return;
  }

  console.log("Identifiants acceptés. École Directe demande la question de sécurité.");
  const qcm = await ed.obtenirQCM(session);
  console.log(`\nQuestion : ${qcm.question}`);
  qcm.propositions.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const choix = Number(await rl.question("\nTape le numéro de la bonne réponse : "));
  rl.close();
  const reponse = qcm.propositions[choix - 1];
  if (!reponse) {
    console.error("Numéro invalide. Relance node configurer.js.");
    process.exit(1);
  }

  const fa = await ed.repondreQCM(session, reponse);
  console.log("Réponse acceptée, connexion finale…");
  const finale = await ed.connexion(session, identifiant, motDePasse, fa);
  if (finale.code !== 200) throw new Error("École Directe redemande le QCM après la bonne réponse.");
  ecrireJSON(FICHIER_SESSION, { fa });
  console.log("Connecté. Session enregistrée dans session.json (ne la partage jamais).");
}

main().catch((err) => {
  console.error(`Erreur${err && err.code ? " " + err.code : ""} :`, err && (err.message || err));
  process.exit(1);
});
