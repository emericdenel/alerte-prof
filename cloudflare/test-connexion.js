// Test à lancer UNE fois sur les serveurs de Cloudflare (npx wrangler dev --remote).
// Il vérifie, sans aucun vrai identifiant, que Cloudflare peut joindre École Directe :
// cookie GTK reçu, puis réponse 505 attendue pour un compte inventé.
import ed from "../ecoledirecte.js";

export default {
  async fetch() {
    const resultat = {};
    try {
      const session = ed.nouvelleSession();
      await ed.connexion(session, "compte-inexistant-test-0000", "faux", null);
      resultat.ecoleDirecte = "réponse 200 inattendue";
    } catch (err) {
      // 505 = École Directe a bien reçu et lu la demande (compte inconnu) : c'est le bon résultat.
      resultat.ecoleDirecte = err.code === 505 ? "OK (505 comme prévu)" : `PROBLÈME : ${err.code} ${err.message}`;
    }
    // Les serveurs Cloudflare sont en UTC : on vérifie qu'on sait calculer l'heure de Paris.
    resultat.heureParis = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
    return Response.json(resultat);
  },
};
