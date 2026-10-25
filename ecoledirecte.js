// Petit client École Directe écrit pour ce projet, avec fetch (natif dans Node 18+).
// Il remplace @papillonapp/ed-core (dernière version : avril 2024), qui ne gère pas
// la connexion actuelle d'École Directe (cookie GTK depuis le 24/03/2025, jetons dans les en-têtes).
// Les étapes suivent la bibliothèque Python « ecoledirecte » 0.4.0 (utilisée par hass-ecoledirecte)
// et la doc communautaire https://github.com/EduWireApps/ecoledirecte-api-docs.
// Rien ici n'est officiel : École Directe peut changer son fonctionnement à tout moment.

const API = "https://api.ecoledirecte.com/v3";
const VERSION = "4.102.0"; // version de l'API utilisée par la bibliothèque Python

// Messages pour les codes renvoyés par École Directe.
const MESSAGES = {
  250: "Double authentification requise (question de sécurité)",
  505: "Identifiant ou mot de passe refusé",
  517: "Version de l'API refusée : le programme doit être mis à jour",
  520: "Jeton invalide",
  525: "Session expirée",
};

// Base64 <-> texte (UTF-8 pour les accents). atob/btoa existent dans Node 18+ et chez Cloudflare,
// contrairement à Buffer qui n'existe que dans Node.
const versBase64 = (texte) => btoa(String.fromCharCode(...new TextEncoder().encode(texte)));
const depuisBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** Crée une session vide : cookies, jeton de connexion et en-têtes à renvoyer. */
function nouvelleSession() {
  return { cookies: new Map(), entetes: {}, eleveId: null };
}

/** Erreur avec le code École Directe dans err.code (ex. 505, 250). */
function erreurED(code, message) {
  const err = new Error(MESSAGES[code] || message || `Réponse inattendue d'École Directe (code ${code})`);
  err.code = code;
  return err;
}

/**
 * Envoie une requête à École Directe et met la session à jour :
 * - on garde les cookies reçus (comme un navigateur) ;
 * - on garde le nouveau jeton « x-token » et, pendant le QCM, le « 2FA-Token ».
 */
async function requete(session, chemin, params, donnees, methode = "POST") {
  const url = `${API}${chemin}?${new URLSearchParams({ ...params, v: VERSION })}`;
  const cookies = [...session.cookies].map(([nom, valeur]) => `${nom}=${valeur}`).join("; ");
  const rep = await fetch(url, {
    method: methode,
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://www.ecoledirecte.com",
      "Referer": "https://www.ecoledirecte.com/",
      // Un jeton obtenu avec un User-Agent doit être réutilisé avec le même.
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
      ...(cookies ? { "Cookie": cookies } : {}),
      ...session.entetes,
    },
    body: methode === "POST" ? "data=" + JSON.stringify(donnees || {}) : undefined,
  });

  // Cookies : on garde seulement "nom=valeur" de chaque Set-Cookie.
  for (const c of rep.headers.getSetCookie ? rep.headers.getSetCookie() : []) {
    const [paire] = c.split(";");
    const i = paire.indexOf("=");
    if (i > 0) session.cookies.set(paire.slice(0, i).trim(), paire.slice(i + 1).trim());
  }
  if (rep.headers.get("x-token")) session.entetes["X-Token"] = rep.headers.get("x-token");
  if (rep.headers.get("2fa-token")) session.entetes["2FA-Token"] = rep.headers.get("2fa-token");

  const texte = await rep.text();
  if (!texte) return null; // ex. la demande de GTK : seuls les cookies comptent
  try {
    return JSON.parse(texte);
  } catch {
    throw erreurED(rep.status, `Réponse illisible d'École Directe (HTTP ${rep.status})`);
  }
}

/** Demande le cookie GTK, obligatoire avant chaque connexion. */
async function preparerGTK(session) {
  delete session.entetes["X-Gtk"];
  await requete(session, "/login.awp", { gtk: 1 }, null, "GET");
  const gtk = session.cookies.get("GTK");
  if (!gtk) throw new Error("École Directe n'a pas renvoyé le cookie GTK : la connexion a peut-être encore changé.");
  session.entetes["X-Gtk"] = gtk;
}

/**
 * Connexion. fa = { cn, cv } reçus après le QCM (ou null la première fois).
 * Renvoie la réponse si le code est 200 ou 250 (QCM demandé), sinon lève une erreur.
 */
async function connexion(session, identifiant, motDePasse, fa) {
  await preparerGTK(session);
  const corps = { identifiant, motdepasse: encodeURIComponent(motDePasse), isReLogin: false };
  if (fa && fa.cn && fa.cv) Object.assign(corps, { cn: fa.cn, cv: fa.cv, uuid: "", fa: [{ cn: fa.cn, cv: fa.cv }] });
  const rep = await requete(session, "/login.awp", {}, corps);
  delete session.entetes["X-Gtk"]; // le GTK ne sert que pour la connexion
  if (rep.code === 200) {
    session.eleveId = rep.data.accounts[0].id; // numéro de l'élève, utilisé dans les adresses
    return rep;
  }
  if (rep.code === 250) return rep;
  throw erreurED(rep.code, rep.message);
}

/** Récupère la question de sécurité. Renvoie { question, propositions } en texte lisible. */
async function obtenirQCM(session) {
  const rep = await requete(session, "/connexion/doubleauth.awp", { verbe: "get" }, {});
  if (rep.code !== 200 || !rep.data) throw erreurED(rep.code, rep.message);
  return { question: depuisBase64(rep.data.question), propositions: rep.data.propositions.map(depuisBase64) };
}

/** Envoie la réponse choisie (en texte). Renvoie { cn, cv } si elle est bonne. */
async function repondreQCM(session, reponse) {
  const choix = versBase64(reponse);
  const rep = await requete(session, "/connexion/doubleauth.awp", { verbe: "post" }, { choix });
  if (rep.code !== 200 || !rep.data || !rep.data.cn) throw erreurED(rep.code, rep.message || "Réponse au QCM refusée");
  return { cn: rep.data.cn, cv: rep.data.cv };
}

/** Emploi du temps entre deux dates "AAAA-MM-JJ" : renvoie un tableau de cours. */
async function emploiDuTemps(session, debut, fin) {
  const rep = await requete(session, `/E/${session.eleveId}/emploidutemps.awp`, { verbe: "get" },
    { dateDebut: debut, dateFin: fin, avecTrous: false });
  if (rep.code !== 200) throw erreurED(rep.code, rep.message);
  return rep.data;
}

module.exports = { nouvelleSession, connexion, obtenirQCM, repondreQCM, emploiDuTemps };
