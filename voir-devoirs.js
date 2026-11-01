// Affiche les devoirs bruts renvoyés par École Directe, pour vérifier les champs.
// Utilisation : node voir-devoirs.js
const { chargerEnv } = require("./lib");
const { seConnecter } = require("./connexion");
const { cahierDeTexte, devoirsDuJour, depuisBase64 } = require("./ecoledirecte");

async function main() {
  chargerEnv();
  const ED = await seConnecter();
  const liste = await cahierDeTexte(ED);
  const dates = Object.keys(liste).sort();
  for (const date of dates) {
    for (const d of liste[date]) {
      console.log(`${date} | ${d.matiere} (${d.codeMatiere}) | idDevoir=${d.idDevoir} aFaire=${d.aFaire} interrogation=${d.interrogation} effectue=${d.effectue} donneLe=${d.donneLe}`);
    }
  }
  console.log(`\n${dates.length} jour(s) avec des devoirs.`);
  if (dates.length === 0) return;

  console.log("Champs d'un devoir de la liste :", Object.keys(liste[dates[0]][0]).join(", "));
  const detail = await devoirsDuJour(ED, dates[0]);
  console.log(`\nDétail du ${detail.date} :`);
  for (const m of detail.matieres || []) {
    const contenu = m.aFaire && m.aFaire.contenu ? depuisBase64(m.aFaire.contenu) : "(pas de travail à faire)";
    console.log(`- ${m.matiere} | ${m.nomProf} | id=${m.id} | contenu : ${contenu.slice(0, 200)}`);
  }
  const m0 = (detail.matieres || [])[0];
  if (m0) {
    console.log("\nChamps d'une matière :", Object.keys(m0).join(", "));
    if (m0.aFaire) console.log("Champs de aFaire :", Object.keys(m0.aFaire).join(", "));
  }
}

main().catch((err) => {
  console.error("Erreur :", err && (err.code ? "erreur " + err.code + " : " : "") + (err.message || err));
  process.exit(1);
});
