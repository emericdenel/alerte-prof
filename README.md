# Alerte prof absent

Un programme qui surveille mon emploi du temps École Directe et m'envoie un message Telegram quand un cours est annulé, remplacé par une autre matière, retiré de l'emploi du temps ou (en option) modifié.

Il parle à École Directe avec un petit client écrit pour le projet (`ecoledirecte.js`). Ce client n'est **pas officiel** : il reproduit les étapes de la bibliothèque Python [ecoledirecte](https://pypi.org/project/ecoledirecte/) et de la [documentation communautaire](https://github.com/EduWireApps/ecoledirecte-api-docs). Il peut cesser de marcher si École Directe change quelque chose.

---

## Guide pas à pas (Windows)

Compte environ 1 h la première fois. Fais les étapes dans l'ordre et ne passe à la suivante que si la précédente marche.

### Étape 1 : installer Node.js

1. Va sur https://nodejs.org et télécharge la version **LTS** pour Windows (fichier `.msi`).
2. Installe-la en laissant les options par défaut.
3. Ouvre **PowerShell** (touche Windows, tape « PowerShell », Entrée) et tape :
   ```
   node -v
   ```
   Tu dois voir un numéro du type `v22.x.x` ou plus. Il faut au moins la version 18.

### Étape 2 : installer le projet

1. Dézippe le dossier `alerte-prof` dans `C:\alerte-prof` (le chemin le plus simple, sans espaces ni accents).
2. Dans PowerShell :
   ```
   cd C:\alerte-prof
   npm install
   ```
   Le projet n'a aucune dépendance externe, donc il n'y a presque rien à télécharger. Des avertissements jaunes (« warn ») sont normaux. Une erreur rouge ne l'est pas : envoie-la-moi.
3. Vérifie que la détection fonctionne avec de faux cours :
   ```
   node test-detection.js
   ```
   Tu dois lire « Tous les tests passent. »

### Étape 3 : créer ton bot Telegram

1. Dans Telegram, cherche **@BotFather** (le compte officiel, avec le badge bleu).
2. Envoie `/newbot`, donne un nom (ex. « Alerte Prof »), puis un identifiant qui finit par `bot` (ex. `alerte_prof_moi_bot`).
3. BotFather te donne un **jeton** du type `123456789:ABC...`. Copie-le. C'est un mot de passe : ne le montre à personne.
4. Ouvre la conversation avec ton nouveau bot et envoie-lui `/start`.
5. Dans ton navigateur, ouvre cette adresse en remplaçant `TON_JETON` :
   ```
   https://api.telegram.org/botTON_JETON/getUpdates
   ```
   Cherche `"chat":{"id":` suivi d'un nombre. Ce nombre est ton **chat id**. Si la page affiche `"result":[]`, renvoie un message au bot et recharge la page.

### Étape 4 : remplir le fichier de configuration

1. Dans PowerShell :
   ```
   copy .env.example .env
   notepad .env
   ```
2. Remplis :
   - `ED_IDENTIFIANT` et `ED_MOT_DE_PASSE` : tes identifiants École Directe
   - `TELEGRAM_TOKEN` : le jeton de l'étape 3
   - `TELEGRAM_CHAT_ID` : le nombre de l'étape 3
3. Enregistre et ferme.

Si ton mot de passe commence ou finit par un espace, mets-le entre guillemets : `ED_MOT_DE_PASSE="mon mot de passe"`.

### Étape 5 : tester Telegram

```
node test-telegram.js
```
Tu dois recevoir « Test réussi » sur Telegram.

### Étape 6 : se connecter à École Directe (une seule fois)

```
node configurer.js
```
- Si École Directe pose sa question de sécurité, le programme affiche la question et les réponses numérotées. Tape le numéro de la bonne réponse.
- À la fin, un fichier `session.json` est créé. Il permet de se reconnecter sans reposer la question. Ne le partage jamais.

### Étape 7 : vérifier comment un cours annulé apparaît (important)

Vérifié dans mon lycée : un cours annulé a `isAnnule: true`. Un cours remplacé (par exemple religion → SVT) garde sa place et change de matière, avec `isModifie: true` : le programme le signale comme « cours remplacé » s'il avait vu le cours avant le changement. Il détecte aussi les cours qui disparaissent de l'emploi du temps.

Choisis un jour récent où un prof était absent et lance :
```
node voir-edt.js 2026-10-14
```
(remplace par la bonne date, au format AAAA-MM-JJ, ou mets deux dates pour une semaine).

- Si le cours du prof absent affiche `annulé=true` : parfait, passe à l'étape 8.
- Sinon : regarde ce qui change pour ce cours (`text`, `typeCours`, `modifié=true`…) et envoie-moi la ligne. J'adapterai la détection.

### Étape 8 : lancer la surveillance

```
node surveiller.js
```
Tu dois voir une ligne « OK : … cours vérifiés ». Laisse tourner, il vérifie toutes les 15 minutes (pause la nuit de 0 h à 6 h). Pour arrêter : `Ctrl + C`.

### Étape 9 : le faire tourner en permanence sur l'autre tour

1. Installe Node.js sur l'autre tour (étape 1), copie le dossier `C:\alerte-prof` complet (avec `.env` et `session.json`), puis lance `npm install` dedans.
2. Empêche la mise en veille : Paramètres → Système → Alimentation → Mise en veille : **Jamais**.
3. Ouvre le **Planificateur de tâches** → **Créer une tâche…** (pas « tâche de base ») :
   - Onglet **Général** : nom « Alerte prof », coche **Exécuter même si l'utilisateur n'est pas connecté**.
   - Onglet **Déclencheurs** → Nouveau → **Au démarrage**.
   - Onglet **Actions** → Nouveau → Démarrer un programme :
     - Programme : `C:\alerte-prof\demarrer.bat`
     - Commencer dans : `C:\alerte-prof`
   - Onglet **Paramètres** : décoche **Arrêter la tâche si elle s'exécute plus de 3 jours**.
4. Valide (Windows demande le mot de passe de la session), clic droit sur la tâche → **Exécuter**.
5. Vérifie que tout va bien en ouvrant `C:\alerte-prof\surveillance.log`.

Si le programme n'arrive plus à vérifier 3 fois de suite, il t'envoie un message Telegram pour te prévenir.

---

### Étape 9 bis (au choix) : le faire tourner en ligne sur Cloudflare, gratuitement

À la place de l'autre tour, le programme peut tourner chez Cloudflare Workers (offre gratuite, sans carte bancaire). Cloudflare le lance toutes les 15 minutes ; l'état est gardé dans le stockage KV.

Pourquoi pas GitHub Actions ? Les [conditions de GitHub](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features) interdisent d'utiliser Actions « as part of a serverless application », et les tâches planifiées peuvent y être retardées ou sautées.

1. Crée un compte sur https://dash.cloudflare.com/sign-up, puis connecte l'outil officiel :
   ```
   npx wrangler@4.150.0 login
   ```
2. Crée le stockage de l'état et recopie son `id` dans `wrangler.toml` (section `[[kv_namespaces]]`) :
   ```
   npx wrangler@4.150.0 kv namespace create ETAT
   ```
3. Déploie le Worker :
   ```
   npx wrangler@4.150.0 deploy
   ```
4. Envoie tes secrets (lus dans `.env` et `session.json`, jamais affichés) :
   ```
   node envoyer-secrets.js
   ```
5. Pour voir les vérifications en direct : `npx wrangler@4.150.0 tail alerte-prof`.
   Déploiement automatique : le Worker est relié au dépôt GitHub (Workers & Pages → alerte-prof → Settings → Builds, commande `npx wrangler@4.150.0 deploy`). Chaque `git push` sur `main` le redéploie, sans toucher aux secrets.
6. **Arrête la surveillance sur le PC**, sinon chaque alerte arrive en double.

Si École Directe repose la question de sécurité : relance `node configurer.js` sur le PC, puis `node envoyer-secrets.js`.

Pour vérifier que Cloudflare peut joindre École Directe avant tout (avec un compte inventé) : `npx wrangler@4.150.0 deploy -c cloudflare/wrangler-test.toml`, ouvre l'adresse affichée (on attend « OK (505 comme prévu) »), puis supprime-le avec `npx wrangler@4.150.0 delete -c cloudflare/wrangler-test.toml`.

## Problèmes fréquents

| Message | Cause probable | Que faire |
|---|---|---|
| `Fichier .env introuvable` | Étape 4 pas faite | `copy .env.example .env` |
| `Pas de session enregistrée` | Étape 6 pas faite | `node configurer.js` |
| `erreur 505` | Identifiant ou mot de passe refusé (ou cookie GTK mal envoyé) | Vérifie `.env` |
| `erreur 250` / « redemande la question de sécurité » | École Directe a oublié l'appareil | Relance `node configurer.js` |
| `erreur 520` / `525` | Jeton invalide ou expiré | Le programme se reconnecte tout seul ; si ça dure, relance `node configurer.js` |
| `erreur 517` | Version de l'API refusée | `ecoledirecte.js` doit être mis à jour (constante `VERSION`) |
| Trop d'échecs de suite | École Directe peut bloquer un moment | Attends, ne descends pas sous 15 minutes |
| `Telegram a refusé le message : Unauthorized` | Jeton faux | Revérifie `TELEGRAM_TOKEN` |
| `Telegram a refusé le message : chat not found` | Chat id faux ou `/start` pas envoyé | Refais l'étape 3 |

## Réglages (`.env`)

| Variable | Rôle | Par défaut |
|---|---|---|
| `INTERVALLE_MINUTES` | Temps entre deux vérifications (minimum 10) | 15 |
| `JOURS_A_SURVEILLER` | Nombre de jours surveillés à partir d'aujourd'hui (1 à 14) | 7 |
| `ALERTER_MODIFICATIONS` | `oui` pour être prévenu aussi des changements de salle ou d'horaire | non |
| `PAUSE_NUIT_DEBUT` / `PAUSE_NUIT_FIN` | Heures sans vérification | 0 / 6 |

## Sécurité et limites

- Les fichiers `.env`, `session.json` et `etat.json` contiennent des secrets ou des données personnelles. Le `.gitignore` les exclut de Git : vérifie avec `git status` qu'ils n'apparaissent jamais avant un commit.
- Le programme utilise **uniquement mon compte**. Si un camarade le veut, il l'installe chez lui avec son propre compte. Je ne stocke jamais les identifiants de quelqu'un d'autre.
- Je n'ai pas trouvé les conditions d'utilisation d'École Directe concernant l'accès automatisé. Le programme limite volontairement le rythme des requêtes.
- Le client est non officiel : si École Directe change sa connexion, il faudra adapter `ecoledirecte.js` (par exemple en regardant ce qu'a changé la bibliothèque Python `ecoledirecte`).
- Un cours annulé tard, ou pendant la pause de nuit, peut être signalé avec du retard.

## Fichiers

| Fichier | Rôle |
|---|---|
| `configurer.js` | Première connexion et question de sécurité |
| `surveiller.js` | Programme principal |
| `voir-edt.js` | Affiche l'emploi du temps brut pour vérifier les champs |
| `test-telegram.js` | Envoie un message de test |
| `test-detection.js` | Teste la détection avec de faux cours |
| `detection.js` | Détection des changements et texte des alertes (partagé PC / Cloudflare) |
| `lib.js` | Fonctions pour le PC : `.env`, fichiers JSON, journal |
| `worker.js` | Version Cloudflare Workers de la surveillance |
| `wrangler.toml` | Configuration Cloudflare (toutes les 15 min, stockage KV, réglages) |
| `envoyer-secrets.js` | Envoie les secrets à Cloudflare sans les afficher |
| `cloudflare/` | Worker de test : Cloudflare peut-il joindre École Directe ? |
| `ecoledirecte.js` | Client École Directe : cookie GTK, jetons, QCM, emploi du temps |
| `connexion.js` | Connexion avec la session enregistrée |
| `demarrer.bat` | Lancement automatique sous Windows |

## Crédits et licence

- Code sous licence [MIT](LICENSE).
- La connexion à École Directe (cookie GTK, jetons, question de sécurité) a été écrite à partir de la [documentation communautaire de l'API](https://github.com/EduWireApps/ecoledirecte-api-docs) et du fonctionnement de la bibliothèque Python [ecoledirecte](https://pypi.org/project/ecoledirecte/). Aucun code de ces projets n'est copié.
- Projet personnel, non affilié à École Directe.
