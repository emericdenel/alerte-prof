// Teste les devoirs avec un faux École Directe et un faux Telegram.
// Lancer : node test-devoirs.js
process.env.TZ = "Europe/Paris";
const assert = require("assert");
const dv = require("./devoirs");

const b64 = (texte) => btoa(String.fromCharCode(...new TextEncoder().encode(texte)));

// Faux cahier de texte, au format vu sur une vraie réponse (2026-11-01).
let cahier = {
  "2026-11-02": [
    { matiere: "MATHEMATIQUES", codeMatiere: "MATHS", aFaire: true, idDevoir: 8784, donneLe: "2026-10-05", effectue: true, interrogation: false },
    { matiere: "HISTOIRE-GEOGRAPHIE", codeMatiere: "HI-GE", aFaire: true, idDevoir: 10935, donneLe: "2026-10-14", effectue: false, interrogation: false },
  ],
  "2026-11-03": [
    { matiere: "ANGLAIS", codeMatiere: "AGL", aFaire: true, idDevoir: 10879, donneLe: "2026-10-14", effectue: false, interrogation: true },
    { matiere: "NSI", codeMatiere: "NSI", aFaire: false, idDevoir: 1, donneLe: "2026-10-14", effectue: false, interrogation: false },
  ],
  "2026-11-20": [
    { matiere: "PHYSIQUE-CHIMIE", codeMatiere: "PH-CH", aFaire: true, idDevoir: 777, donneLe: "2026-10-30", effectue: false, interrogation: false },
  ],
};
const textes = {
  8784: "<p>Rendre DM n°2</p>",
  10935: '<p><span style="color:hsl(24, 96%, 55%);"><strong>Rendre le coupon-r&eacute;ponse</strong></span></p>',
  10879: "<p>Vocabulaire unit&#233; 3<br>et verbes irréguliers</p>",
  777: "<p>TP &amp; compte rendu</p>",
  999: "<p>Exercices 12 à 15 p. 84</p>",
};
const demandes = [];
const fauxED = {
  depuisBase64: require("./ecoledirecte").depuisBase64,
  cahierDeTexte: async () => cahier,
  devoirsDuJour: async (session, date) => {
    demandes.push(date);
    return { date, matieres: (cahier[date] || []).map((e) => ({ matiere: e.matiere, id: e.idDevoir, aFaire: textes[e.idDevoir] ? { contenu: b64(textes[e.idDevoir]) } : undefined })) };
  },
};

async function main() {
  // 1. Le HTML devient du texte lisible (entités et balises comprises).
  assert.strictEqual(dv.htmlVersTexte(textes[10935]), "Rendre le coupon-réponse");
  assert.strictEqual(dv.htmlVersTexte(textes[10879]), "Vocabulaire unité 3\net verbes irréguliers");
  assert.strictEqual(dv.jourLisible("2026-11-03"), "mardi 3/11");

  // 2. Seuls les éléments « à faire » sont gardés, triés par date puis par matière.
  const liste = dv.listerDevoirs(cahier);
  assert.deepStrictEqual(liste.map((d) => d.id), [10935, 8784, 10879, 777]);

  // 3. Premier lancement (dimanche 21 h) : pas d'annonce un par un, mais le récap de la semaine.
  const maintenant = new Date("2026-11-01T21:00:00");
  let envoyes = [];
  const etat = {};
  const options = { maintenant, ed: fauxED, envoyer: async (t) => envoyes.push(t), enregistrer: async () => {} };
  let r = await dv.verifierDevoirs({}, etat, options);
  assert.strictEqual(r.nouveaux, 0);
  assert.strictEqual(r.recap, true);
  assert.strictEqual(envoyes.length, 1);
  assert.ok(envoyes[0].startsWith("📚 Tes devoirs sont maintenant suivis"));
  assert.ok(envoyes[0].includes("Devoirs du lundi 2/11 au dimanche 8/11"));
  assert.ok(envoyes[0].includes("✅ MATHEMATIQUES : Rendre DM n°2"));
  assert.ok(envoyes[0].includes("📝 ANGLAIS (contrôle) : Vocabulaire unité 3 et verbes irréguliers"));
  assert.ok(!envoyes[0].includes("PHYSIQUE-CHIMIE"), "un devoir hors de la semaine n'est pas dans le récap");
  assert.ok(!demandes.includes("2026-11-20"), "pas de requête pour un jour hors de la semaine");
  assert.deepStrictEqual([...etat.devoirsVus].sort((a, b) => a - b), [777, 8784, 10879, 10935]);
  assert.strictEqual(etat.dernierRecap, "2026-11-01");

  // 4. Rien de nouveau, et récap déjà envoyé aujourd'hui : aucun message.
  envoyes = [];
  r = await dv.verifierDevoirs({}, etat, { ...options, maintenant: new Date("2026-11-01T21:15:00") });
  assert.strictEqual(envoyes.length, 0);

  // 5. Un nouveau devoir apparaît : un seul message, avec son texte.
  cahier = { ...cahier, "2026-11-04": [{ matiere: "MATHEMATIQUES", aFaire: true, idDevoir: 999, donneLe: "2026-11-02", interrogation: false }] };
  envoyes = [];
  r = await dv.verifierDevoirs({}, etat, { ...options, maintenant: new Date("2026-11-02T17:00:00") });
  assert.strictEqual(r.nouveaux, 1);
  assert.deepStrictEqual(envoyes, ["📚 Nouveau devoir : MATHEMATIQUES\nPour mercredi 4/11 (donné le 2/11)\nExercices 12 à 15 p. 84"]);
  assert.ok(etat.devoirsVus.includes(999));

  // 6. Le même devoir n'est pas annoncé deux fois.
  envoyes = [];
  await dv.verifierDevoirs({}, etat, { ...options, maintenant: new Date("2026-11-02T17:15:00") });
  assert.strictEqual(envoyes.length, 0);

  // 7. Un contrôle annoncé a son propre titre.
  assert.ok(dv.texteNouveauDevoir({ matiere: "ANGLAIS", date: "2026-11-03", donneLe: "2026-10-14", interrogation: true }, "")
    .startsWith("📝 Contrôle annoncé : ANGLAIS\nLe mardi 3/11"));

  // 8. Le récap part le dimanche à partir de 18 h, une seule fois.
  assert.strictEqual(dv.recapAEnvoyer(new Date("2026-11-08T17:45:00"), etat, 0, 18), false);
  assert.strictEqual(dv.recapAEnvoyer(new Date("2026-11-08T18:00:00"), etat, 0, 18), true);
  assert.strictEqual(dv.recapAEnvoyer(new Date("2026-11-08T18:15:00"), { dernierRecap: "2026-11-08" }, 0, 18), false);
  assert.strictEqual(dv.recapAEnvoyer(new Date("2026-11-09T18:00:00"), etat, 0, 18), false);

  // 9. Semaine sans devoir : message clair.
  assert.ok(dv.texteRecap([], new Map(), "2026-11-09", "2026-11-15")[0].includes("Rien de noté"));

  // 10. Récap très long : découpé en plusieurs messages acceptés par Telegram.
  const beaucoup = Array.from({ length: 60 }, (_, i) => ({ id: i, date: `2026-11-0${2 + (i % 7)}`, matiere: "MATIERE " + i, interrogation: false, effectue: false }));
  const longs = new Map(beaucoup.map((d) => [d.id, "x".repeat(300)]));
  const messages = dv.texteRecap(beaucoup, longs, "2026-11-02", "2026-11-08");
  assert.ok(messages.length > 1);
  assert.ok(messages.every((m) => m.length <= 4096));

  console.log("Tous les tests des devoirs passent.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
