// Envoie les secrets à Cloudflare (une fois, ou après un nouveau configurer.js).
// Lit .env et session.json et les transmet à wrangler par l'entrée standard :
// rien n'est affiché à l'écran ni écrit dans un fichier temporaire.
// Copie aussi etat.json dans le stockage KV, pour que Cloudflare reprenne où le PC s'est arrêté.
// Utilisation : node envoyer-secrets.js
const { spawnSync } = require("child_process");
const fs = require("fs");
const { chargerEnv, exiger, lireJSON, FICHIER_SESSION, FICHIER_ETAT } = require("./lib");

const WRANGLER = ["-y", "wrangler@4.150.0"];

function wrangler(args, entree) {
  // Une seule ligne de commande (arguments fixes, écrits ici) : le shell est nécessaire
  // sous Windows pour lancer npx. Les secrets passent par l'entrée standard, jamais par la ligne.
  const res = spawnSync(["npx", ...WRANGLER, ...args].join(" "), {
    cwd: __dirname,
    input: entree,
    stdio: [entree ? "pipe" : "ignore", "inherit", "inherit"],
    shell: true,
  });
  if (res.status !== 0) throw new Error(`wrangler ${args.slice(0, 2).join(" ")} a échoué.`);
}

chargerEnv();
const session = lireJSON(FICHIER_SESSION, null);
if (!session) throw new Error("Pas de session.json : lance d'abord node configurer.js");

const secrets = {
  ED_IDENTIFIANT: exiger("ED_IDENTIFIANT"),
  ED_MOT_DE_PASSE: exiger("ED_MOT_DE_PASSE"),
  TELEGRAM_TOKEN: exiger("TELEGRAM_TOKEN"),
  TELEGRAM_CHAT_ID: exiger("TELEGRAM_CHAT_ID"),
};
if (session.fa) Object.assign(secrets, { ED_CN: session.fa.cn, ED_CV: session.fa.cv });

console.log(`Envoi de ${Object.keys(secrets).length} secrets à Cloudflare : ${Object.keys(secrets).join(", ")}`);
wrangler(["secret", "bulk"], JSON.stringify(secrets));

if (fs.existsSync(FICHIER_ETAT)) {
  console.log("Copie de etat.json dans le stockage KV…");
  wrangler(["kv", "key", "put", "etat", "--binding", "ETAT", "--path", "etat.json", "--remote"]);
}
console.log("Terminé. Le Worker utilisera ces secrets dès sa prochaine vérification.");
