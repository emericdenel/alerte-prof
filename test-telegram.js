// Vérifie que le bot Telegram peut t'envoyer un message.
const { chargerEnv, envoyerTelegram } = require("./lib");

chargerEnv();
envoyerTelegram("✅ Test réussi : ton bot d'alertes fonctionne.")
  .then(() => console.log("Message envoyé, regarde Telegram."))
  .catch((err) => {
    console.error("Erreur :", err.message);
    process.exit(1);
  });
