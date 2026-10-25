// Détection des changements d'emploi du temps et texte des alertes.
// Ce fichier ne lit ni fichiers ni .env : il sert à la fois sur le PC (surveiller.js)
// et chez Cloudflare (worker.js).

/**
 * Heure de Paris « vue comme une heure locale ». Sur le PC (fuseau réglé sur Paris), c'est
 * simplement l'heure actuelle. Chez Cloudflare (serveurs en UTC), getHours() donne quand même
 * l'heure de Paris, ce qui colle avec les dates d'École Directe lues par lireDateED().
 */
function heureParis() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
}

// Date au format YYYY-MM-DD, en heure locale.
function formatJour(date) {
  const a = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const j = String(date.getDate()).padStart(2, "0");
  return `${a}-${m}-${j}`;
}

function ajouterJours(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// École Directe renvoie des dates du type "2026-11-03 08:00".
function lireDateED(texte) {
  const d = new Date(String(texte).replace(" ", "T"));
  return isNaN(d) ? null : d;
}

function nomCours(c) {
  return c.matiere || c.text || "Cours";
}

function decrireCours(c) {
  const debut = lireDateED(c.start_date);
  const fin = lireDateED(c.end_date);
  const jours = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  let quand = c.start_date;
  if (debut) {
    const h = (d) => `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
    quand = `${jours[debut.getDay()]} ${debut.getDate()}/${debut.getMonth() + 1} de ${h(debut)}${fin ? " à " + h(fin) : ""}`;
  }
  const prof = c.prof ? ` avec ${c.prof}` : "";
  return `${nomCours(c)}${prof}, ${quand}`;
}

// Clé unique d'un événement à signaler (un cours + un type de changement).
function cle(type, c) {
  return `${type}|${c.id}|${c.start_date}`;
}

// Vrai si le cours a changé de matière ou de prof (ex. religion remplacée par SVT).
function aChange(ancien, c) {
  return (ancien.matiere || "") !== (c.matiere || "") || (ancien.prof || "") !== (c.prof || "");
}

/**
 * Compare l'emploi du temps actuel avec le précédent et renvoie les alertes nouvelles.
 * - "annule" : le cours est marqué isAnnule
 * - "remplace" : un cours connu a changé de matière ou de prof (même id, ou nouveau cours
 *   à la même heure qu'un cours disparu). Cas réel observé : religion remplacée par SVT,
 *   avec isModifie=true et isAnnule=false.
 * - "modifie" : le cours est marqué isModifie (salle, horaire…), si activé
 * - "retire" : un cours futur présent la dernière fois a disparu, sans remplaçant
 */
function trouverAlertes(coursActuels, etat, options = {}) {
  const maintenant = options.maintenant || new Date();
  const finFenetre = options.finFenetre || null; // Date : jour suivant la fin de la période récupérée
  const avecModifs = options.avecModifs || false;
  const dejaSignale = new Set(etat.signale || []);
  const anciens = etat.derniersCours || [];
  const anciensParId = new Map(anciens.map((c) => [c.id, c]));
  const idsActuels = new Set(coursActuels.map((c) => c.id));
  const alertes = [];
  const ajouter = (type, cours, ancien) => {
    const k = cle(type, cours);
    if (!dejaSignale.has(k)) alertes.push({ type, cle: k, cours, ancien });
  };

  // Cours futurs pas encore vérifiés la dernière fois qui ont disparu depuis.
  const disparus = anciens.filter((a) => {
    const debut = lireDateED(a.start_date);
    if (!debut || debut < maintenant) return false;
    if (finFenetre && debut >= finFenetre) return false; // hors de la période récupérée cette fois
    return !a.isAnnule && !idsActuels.has(a.id); // un cours annulé a déjà été signalé
  });
  // Liste vide alors qu'il y avait des cours : sûrement une panne d'École Directe, pas des
  // cours supprimés. On ne signale rien plutôt que d'envoyer une rafale de fausses alertes.
  if (coursActuels.length === 0) disparus.length = 0;

  for (const c of coursActuels) {
    const debut = lireDateED(c.start_date);
    if (debut && debut < maintenant) continue; // on ignore le passé
    // Même cours qu'avant, ou à défaut un cours disparu qui commençait à la même heure.
    let ancien = anciensParId.get(c.id);
    if (!ancien) {
      const i = disparus.findIndex((a) => a.start_date === c.start_date);
      if (i >= 0) ancien = disparus.splice(i, 1)[0]; // il a un remplaçant : ce n'est plus un "retire"
    }
    if (c.isAnnule) ajouter("annule", c);
    else if (ancien && aChange(ancien, c)) ajouter("remplace", c, ancien);
    else if (avecModifs && c.isModifie) ajouter("modifie", c);
  }

  for (const ancien of disparus) ajouter("retire", ancien);
  return alertes;
}

function texteAlerte(a) {
  const titres = {
    annule: "❌ Cours annulé",
    remplace: "🔄 Cours remplacé",
    modifie: "✏️ Cours modifié",
    retire: "⚠️ Cours retiré de l'emploi du temps",
  };
  if (a.type === "remplace") {
    const avant = `${a.ancien.matiere || a.ancien.text || "Cours"}${a.ancien.prof ? " (" + a.ancien.prof + ")" : ""}`;
    return `${titres.remplace}
${avant} → ${decrireCours(a.cours)}`;
  }
  return `${titres[a.type]}
${decrireCours(a.cours)}`;
}

// On ne garde que les champs utiles pour comparer la prochaine fois.
function resumerCours(c) {
  return { id: c.id, matiere: c.matiere, text: c.text, prof: c.prof, start_date: c.start_date, end_date: c.end_date, isAnnule: c.isAnnule, isModifie: c.isModifie };
}

// Envoie un message Telegram. Le jeton et le chat id sont passés en paramètre
// (lus dans .env sur le PC, dans les secrets chez Cloudflare).
async function envoyerTelegramAvec(jeton, chat, texte) {
  const rep = await fetch(`https://api.telegram.org/bot${jeton}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: texte }),
  });
  const json = await rep.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram a refusé le message : ${json.description || rep.status}`);
}

module.exports = {
  heureParis, formatJour, ajouterJours, lireDateED, decrireCours,
  trouverAlertes, texteAlerte, resumerCours, envoyerTelegramAvec,
};
