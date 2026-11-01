// Devoirs (cahier de texte École Directe) : message dès qu'un nouveau devoir apparaît,
// et récapitulatif des devoirs de la semaine une fois par semaine (dimanche 18 h par défaut).
// Comme detection.js, ce fichier ne lit ni fichiers ni .env : il sert sur le PC (surveiller.js)
// et chez Cloudflare (worker.js).
//
// Vu sur de vraies réponses (2026-11-01, voir-devoirs.js) :
// - cahierdetexte.awp : { "2026-11-03": [ { matiere, codeMatiere, aFaire, idDevoir, donneLe,
//   effectue, interrogation, documentsAFaire, rendreEnLigne, tags } ] }
// - cahierdetexte/{date}.awp : { date, matieres: [ { matiere, nomProf, id (= idDevoir),
//   aFaire: { contenu (HTML en base64), ... } } ] }
const edParDefaut = require("./ecoledirecte");
const { formatJour, ajouterJours } = require("./detection");

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LIMITE_TELEGRAM = 3800; // Telegram refuse les messages de plus de 4096 caractères

// "2026-11-03" → "3/11"
function dateCourte(date) {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  return isNaN(d) ? String(date) : `${d.getDate()}/${d.getMonth() + 1}`;
}

// "2026-11-03" → "mardi 3/11"
function jourLisible(date) {
  const d = new Date(`${String(date).slice(0, 10)}T12:00:00`);
  return isNaN(d) ? String(date) : `${JOURS[d.getDay()]} ${dateCourte(date)}`;
}

// Le texte d'un devoir est du HTML (<p>, <strong>, <span style=…>) : on garde le texte seul.
function htmlVersTexte(html) {
  const entites = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };
  return String(html || "")
    .replace(/<br\s*\/?>|<\/(p|div|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (tout, nom) => entites[nom.toLowerCase()] ?? tout)
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function couper(texte, max) {
  return texte.length > max ? texte.slice(0, max - 1).trimEnd() + "…" : texte;
}

/** Liste plate des devoirs à faire, triée par date : [{ id, date, matiere, interrogation, effectue, donneLe }]. */
function listerDevoirs(cahier) {
  const devoirs = [];
  for (const [date, elements] of Object.entries(cahier || {})) {
    for (const e of elements || []) {
      if (!e.aFaire) continue;
      devoirs.push({ id: e.idDevoir, date, matiere: e.matiere || e.codeMatiere || "Matière",
        interrogation: !!e.interrogation, effectue: !!e.effectue, donneLe: e.donneLe || "" });
    }
  }
  return devoirs.sort((a, b) => a.date.localeCompare(b.date) || a.matiere.localeCompare(b.matiere));
}

/** Textes des devoirs d'un jour (réponse de devoirsDuJour) : Map idDevoir → texte lisible. */
function contenusDuJour(detail, depuisBase64 = edParDefaut.depuisBase64) {
  const contenus = new Map();
  for (const m of (detail && detail.matieres) || []) {
    if (!m.aFaire || !m.aFaire.contenu) continue;
    try {
      contenus.set(m.id, htmlVersTexte(depuisBase64(m.aFaire.contenu)));
    } catch {
      // contenu illisible : le message affichera seulement la matière
    }
  }
  return contenus;
}

function texteNouveauDevoir(d, contenu) {
  const donne = d.donneLe ? ` (donné le ${dateCourte(d.donneLe)})` : "";
  const titre = d.interrogation ? `📝 Contrôle annoncé : ${d.matiere}` : `📚 Nouveau devoir : ${d.matiere}`;
  const pour = d.interrogation ? `Le ${jourLisible(d.date)}${donne}` : `Pour ${jourLisible(d.date)}${donne}`;
  return [titre, pour, contenu ? couper(contenu, 1200) : ""].filter(Boolean).join("\n");
}

/**
 * Récapitulatif des devoirs entre debut et fin ("AAAA-MM-JJ", inclus), groupés par jour.
 * Renvoie une liste de messages (plusieurs si c'est trop long pour un seul message Telegram).
 */
function texteRecap(devoirs, contenus, debut, fin, intro = "") {
  const titre = `🗓️ Devoirs du ${jourLisible(debut)} au ${jourLisible(fin)}`;
  const semaine = devoirs.filter((d) => d.date >= debut && d.date <= fin);
  if (semaine.length === 0) return [`${[intro, titre].filter(Boolean).join("\n")}\n\nRien de noté dans le cahier de texte. 🎉`];

  const blocs = [];
  for (const date of [...new Set(semaine.map((d) => d.date))]) {
    const lignes = semaine.filter((d) => d.date === date).map((d) => {
      const marque = d.effectue ? "✅ " : d.interrogation ? "📝 " : "• ";
      const contenu = contenus.get(d.id);
      return `${marque}${d.matiere}${d.interrogation ? " (contrôle)" : ""}${contenu ? " : " + couper(contenu.replace(/\n/g, " "), 220) : ""}`;
    });
    const jour = jourLisible(date);
    blocs.push(`${jour.charAt(0).toUpperCase()}${jour.slice(1)}\n${lignes.join("\n")}`);
  }
  const controles = semaine.filter((d) => d.interrogation).length;
  const total = `${semaine.length} devoir(s)${controles ? `, dont ${controles} contrôle(s)` : ""}.`;

  // On regroupe les jours dans des messages de taille acceptée par Telegram.
  const messages = [];
  let courant = [intro, titre, total].filter(Boolean).join("\n");
  for (const bloc of blocs) {
    if (courant.length + bloc.length + 2 > LIMITE_TELEGRAM) {
      messages.push(courant);
      courant = "";
    }
    courant += (courant ? "\n\n" : "") + bloc;
  }
  messages.push(courant);
  return messages;
}

/** Vrai si c'est le jour et l'heure du récap (heure de Paris) et qu'il n'a pas encore été envoyé aujourd'hui. */
function recapAEnvoyer(maintenant, etat, jour, heure) {
  return maintenant.getDay() === jour && maintenant.getHours() >= heure && etat.dernierRecap !== formatJour(maintenant);
}

/**
 * Vérifie les devoirs avec une session École Directe déjà connectée.
 * - nouveau devoir (idDevoir jamais vu) → un message ;
 * - jour et heure du récap → les devoirs des 7 prochains jours ;
 * - tout premier lancement → on mémorise les devoirs existants sans les annoncer un par un
 *   et on envoie directement le récap de la semaine.
 * Modifie etat (devoirsVus, dernierRecap) et l'enregistre après chaque envoi.
 */
async function verifierDevoirs(session, etat, options) {
  const { maintenant, envoyer, enregistrer, jourRecap = 0, heureRecap = 18, ed = edParDefaut } = options;
  const devoirs = listerDevoirs(await ed.cahierDeTexte(session));
  const premiereFois = !Array.isArray(etat.devoirsVus);
  const vus = new Set(etat.devoirsVus || []);
  const nouveaux = premiereFois ? [] : devoirs.filter((d) => !vus.has(d.id));
  const recap = premiereFois || recapAEnvoyer(maintenant, etat, jourRecap, heureRecap);
  const debut = formatJour(ajouterJours(maintenant, 1));
  const fin = formatJour(ajouterJours(maintenant, 7));

  // Le texte des devoirs demande une requête par jour : seulement pour les jours utiles.
  const jours = new Set(nouveaux.map((d) => d.date));
  if (recap) devoirs.filter((d) => d.date >= debut && d.date <= fin).forEach((d) => jours.add(d.date));
  const contenus = new Map();
  for (const jour of jours) {
    for (const [id, texte] of contenusDuJour(await ed.devoirsDuJour(session, jour), ed.depuisBase64)) contenus.set(id, texte);
  }

  const garder = () => { etat.devoirsVus = [...vus].slice(-300); }; // l'historique récent suffit
  for (const d of nouveaux) {
    await envoyer(texteNouveauDevoir(d, contenus.get(d.id)));
    vus.add(d.id);
    garder();
    await enregistrer(etat); // tout de suite : pas de doublon si l'envoi suivant échoue
  }
  if (premiereFois) devoirs.forEach((d) => vus.add(d.id));
  garder();

  if (recap) {
    const intro = premiereFois
      ? "📚 Tes devoirs sont maintenant suivis : je te préviens dès qu'un nouveau devoir est ajouté, et je t'envoie ceux de la semaine chaque " +
        `${JOURS[jourRecap]} à ${heureRecap} h.`
      : "";
    for (const message of texteRecap(devoirs, contenus, debut, fin, intro)) await envoyer(message);
    etat.dernierRecap = formatJour(maintenant);
  }
  await enregistrer(etat);
  return { devoirs: devoirs.length, nouveaux: nouveaux.length, recap };
}

module.exports = {
  jourLisible, htmlVersTexte, listerDevoirs, contenusDuJour, texteNouveauDevoir, texteRecap,
  recapAEnvoyer, verifierDevoirs,
};
