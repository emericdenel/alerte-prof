// Affiche l'emploi du temps brut d'une période, pour voir comment École Directe
// représente un cours annulé ou un prof absent.
// Utilisation : node voir-edt.js 2026-11-03            (un jour)
//               node voir-edt.js 2026-11-03 2026-11-07 (une période)
const { chargerEnv } = require("./lib");
const { seConnecter } = require("./connexion");
const { emploiDuTemps } = require("./ecoledirecte");

async function main() {
  chargerEnv();
  const [debut, fin] = process.argv.slice(2);
  if (!debut) {
    console.log("Donne une date : node voir-edt.js AAAA-MM-JJ [AAAA-MM-JJ]");
    return;
  }
  const ED = await seConnecter();
  const cours = await emploiDuTemps(ED, debut, fin || debut);
  for (const c of cours) {
    console.log(`${c.start_date} → ${c.end_date} | ${c.matiere || c.text} | ${c.prof} | annulé=${c.isAnnule} modifié=${c.isModifie} | typeCours=${c.typeCours} | text="${c.text}"`);
  }
  console.log(`\n${cours.length} cours. Détail complet du premier cours annulé ou modifié (s'il y en a) :`);
  const special = cours.find((c) => c.isAnnule || c.isModifie);
  console.log(special ? JSON.stringify(special, null, 2) : "aucun");
}

main().catch((err) => {
  console.error("Erreur :", err && (err.message || err));
  process.exit(1);
});
