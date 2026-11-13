# stockjnm

Application de stocks et de contrôle des prix pour Kookasia, Mojo et Oncle Hô.

## Déploiement Vercel

Importer ce dépôt, nommer le projet `stockjnm`, choisir le preset Other. Aucun build. Garder le répertoire de sortie racine.

Connecter une base PostgreSQL via Vercel Marketplace (par exemple Neon), puis définir ces variables serveur :

- `DATABASE_URL` : URL PostgreSQL avec SSL.
- `APP_PASSWORD` : code d’accès partagé long et aléatoire, transmis aux seules personnes autorisées.
- `SESSION_SECRET` : secret aléatoire d’au moins 32 octets.

Redéployer après configuration. Sans ces trois variables, l’espace réel reste inaccessible et seule une démonstration locale fictive peut être utilisée. Aucune facture ni donnée extraite des mails n’est incluse dans le code source public.

L’authentification utilise un accès d’équipe partagé et un cookie HttpOnly Secure de 12 heures. Les noms de saisie sont déclaratifs, pas des identités individuelles authentifiées. Tous les utilisateurs connectés ont accès aux trois établissements. Une configuration d’identités individuelles sera nécessaire pour des droits distincts par personne.

## Fonctionnement

- Catalogue fournisseur avec référence et conditionnement fixes.
- Commandes téléphoniques, e-mail ou sur place, prix convenu conservé.
- Réceptions partielles par Tara (Kookasia), Andrea (Mojo), Annie/Cathy/Michel/Noi (Oncle Hô).
- Stock augmenté uniquement à réception, ajusté par comptage ou sortie.
- Prix facturés nets HT, écarts au prix convenu et au précédent achat pour le même produit et établissement.
- Factures historiques sans commande : prix conservé, conformité indiquée non vérifiable.
- Consignes, avoirs, taxes et frais exclus du prix produit. Pas de traitement comptable automatique.
- Export CSV avec protection des cellules contre l’injection de formules.
- Reconnaissance de texte sur photo via Tesseract.js dans le navigateur. Téléchargement initial du moteur et du modèle français depuis les CDN du projet. Aucune photo n’est conservée.
- Dictée française via l’API SpeechRecognition de Chrome. Le service du navigateur peut traiter l’audio à distance. L’utilisateur déclenche lui-même le microphone et valide le texte.

La reconnaissance prépare du texte à vérifier ; elle ne valide ni les lignes d’une facture ni les prix automatiquement. Les factures saisies ne changent pas les stocks.

## Développement

`pnpm install`, `pnpm test`, puis `pnpm dev` (démonstration sur http://127.0.0.1:4173).

L’API serveur conserve l’état JSON dans PostgreSQL. Les écritures utilisent une révision atomique pour empêcher l’écrasement d’une modification simultanée et un identifiant d’action pour éviter les doublons. Prévoir la sauvegarde et la restauration de la base avec le fournisseur PostgreSQL.
