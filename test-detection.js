// Teste la détection avec de faux cours, sans École Directe ni Telegram.
// Lancer : node test-detection.js
const assert = require("assert");
const { trouverAlertes, texteAlerte } = require("./lib");

const maintenant = new Date("2026-11-02T07:00:00");
const finFenetre = new Date("2026-11-09T00:00:00");
const cours = (id, debut, extra = {}) => ({
  id, matiere: "MATHEMATIQUES", prof: "M. EXEMPLE",
  start_date: `2026-11-${debut}`, end_date: `2026-11-${debut.slice(0, 3)}${String(Number(debut.slice(3, 5)) + 1).padStart(2, "0")}:00`,
  isAnnule: false, isModifie: false, ...extra,
});

// 1. Un cours annulé à venir déclenche une alerte.
let etat = { signale: [], derniersCours: [] };
let a = trouverAlertes([cours(1, "02 08:00", { isAnnule: true })], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 1);
assert.strictEqual(a[0].type, "annule");

// 2. Le même cours ne déclenche pas une deuxième alerte.
etat.signale.push(a[0].cle);
a = trouverAlertes([cours(1, "02 08:00", { isAnnule: true })], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 0);

// 3. Un cours déjà passé est ignoré.
a = trouverAlertes([cours(2, "01 08:00", { isAnnule: true })], { signale: [] }, { maintenant, finFenetre });
assert.strictEqual(a.length, 0);

// 4. Un cours futur qui disparaît déclenche "retire".
etat = { signale: [], derniersCours: [cours(3, "03 10:00"), cours(4, "03 11:00")] };
a = trouverAlertes([cours(4, "03 11:00")], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 1);
assert.strictEqual(a[0].type, "retire");

// 5. Un cours hors de la période récupérée n'est pas considéré comme retiré.
etat = { signale: [], derniersCours: [cours(5, "10 10:00")] };
a = trouverAlertes([], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 0);

// 6. Les modifications ne sont signalées que si l'option est activée.
const modifie = [cours(6, "04 09:00", { isModifie: true })];
assert.strictEqual(trouverAlertes(modifie, { signale: [] }, { maintenant, finFenetre }).length, 0);
assert.strictEqual(trouverAlertes(modifie, { signale: [] }, { maintenant, finFenetre, avecModifs: true }).length, 1);

// 7. Même cours (même id) qui change de matière : "remplace" (cas réel : religion → SVT).
const religion = cours(7, "05 09:00", { matiere: "RELIGION", prof: "M. RELIGION" });
const svt = cours(7, "05 09:00", { matiere: "SCIENCES VIE & TERRE", prof: "MME EXEMPLE", isModifie: true });
etat = { signale: [], derniersCours: [religion] };
a = trouverAlertes([svt], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 1);
assert.strictEqual(a[0].type, "remplace");
assert.strictEqual(a[0].ancien.matiere, "RELIGION");

// 8. Cours disparu + nouveau cours (autre id) à la même heure : "remplace", pas "retire".
a = trouverAlertes([{ ...svt, id: 8 }], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 1);
assert.strictEqual(a[0].type, "remplace");

// 9. Un cours inchangé ne déclenche rien, même s'il est marqué modifié (option désactivée).
a = trouverAlertes([{ ...religion, isModifie: true }], etat, { maintenant, finFenetre });
assert.strictEqual(a.length, 0);

// 10. Liste vide (panne d'École Directe) : aucune fausse alerte "retire".
etat = { signale: [], derniersCours: [cours(10, "03 10:00"), cours(11, "03 11:00")] };
assert.strictEqual(trouverAlertes([], etat, { maintenant, finFenetre }).length, 0);

// 11. Les dates sont lues en heure de Paris, même si le serveur est en UTC.
assert.strictEqual(process.env.TZ, "Europe/Paris");
assert.strictEqual(new Date("2026-11-02T08:00").getHours(), 8);

console.log("Exemple de message :\n" + texteAlerte({ type: "annule", cours: cours(1, "02 08:00") }));
console.log("\nExemple de remplacement :\n" + texteAlerte(trouverAlertes([svt], etat, { maintenant, finFenetre })[0]));
console.log("\nTous les tests passent.");
