# stockjnm

Application de stocks et de contrôle des prix pour Kookasia, Mojo et Oncle Hô.

## Déploiement Vercel

Importer ce dépôt, nommer le projet `stockjnm`, choisir le preset Other. Aucun build. Garder le répertoire de sortie racine.

Connecter une base PostgreSQL via Vercel Marketplace (par exemple Neon), puis définir ces variables serveur :

- `DATABASE_URL` : URL PostgreSQL avec SSL.
- `APP_PASSWORD` : code personnel de Jean-Noel, direction uniquement (au moins 16 caractères).
- `SESSION_SECRET` : secret aléatoire d’au moins 32 octets.

Redéployer après configuration. Sans ces trois variables, l’espace réel reste inaccessible et seule une démonstration locale fictive peut être utilisée. Aucune facture ni donnée extraite des mails n’est incluse dans le code source public.

Les identités personnelles et les droits sont vérifiés côté serveur. Les sessions utilisent un cookie HttpOnly Secure de 12 heures.

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

Accès personnels : APP_PASSWORD est réservé à Jean-Noel (direction). Ne pas le distribuer à l’équipe. Chaque collaborateur utilise « Créer mon compte » pour choisir son mot de passe (12 à 128 caractères). Jean-Noel valide ensuite son identité dans « Accès collaborateurs ». Avant validation, aucune session ni donnée de stock n’est accessible. Jean-Noel peut créer son compte en confirmant son code direction APP_PASSWORD. Son nouveau mot de passe est haché en base, active immédiatement son compte et remplace APP_PASSWORD pour les connexions. Un compte existant ne peut pas être remplacé par une inscription. Les demandes en double et la réinscription d’un compte actif sont refusées. Jean-Noel peut refuser une demande incorrecte pour permettre une nouvelle inscription. Les codes sont hachés avec scrypt et sel aléatoire ; leur changement invalide les sessions existantes. Chaque collaborateur ne reçoit du serveur que les commandes, réceptions, factures et mouvements de son établissement. Le catalogue fournisseur est commun et modifiable par la direction seule. L’auteur des opérations est imposé par la session. Les collaborateurs d’un même établissement partagent son stock et disposent chacun du journal « Mes réceptions ».

Photo : caméra directe getUserMedia, sans import de fichier ; HTTPS et autorisation caméra nécessaires. La dictée et la photo ajoutent leur texte dans la même zone. Une réception peut ouvrir cet outil puis retrouver son formulaire et son texte. Les images ne sont pas conservées ; le texte de réception validé l’est. La prise de vue réelle et le microphone doivent être testés sur le téléphone utilisé.


Version libre : la page principale ouvre un choix de profil sans mot de passe. État vide initial, sauvegarde dans localStorage jnmstock-libre, aucune synchronisation ni authentification des profils. Le mode libre ne lit ni ne modifie les stocks PostgreSQL. L’espace authentifié reste disponible via ?espace=partage. Effacer les données du navigateur efface les saisies locales ; exporter les tableaux utiles avant cela.


Commandes : sélection du fournisseur puis du produit, jusqu’à 30 lignes enregistrées ensemble, unités carton/kg/unité et autres conditionnements. Le nouveau catalogue est rattaché à chaque établissement ; les anciennes références communes restent compatibles. Historique filtrable par établissement, fournisseur et recherche produit. Préparation d’un e-mail par fournisseur et établissement, destinataire Rabot andre.j@rabot.nc et adresse centrale factures.jnm@outlook.com pour les autres, modifiables dans les contacts. Le bouton ouvre la messagerie de l’appareil via mailto : envoi à confirmer dans cette messagerie, sans statut d’envoi automatique. Photos produit prises par caméra, compressées en JPEG et conservées avec le produit (localement en accès libre, dans PostgreSQL dans l’espace protégé). La caméra réelle doit être autorisée et testée sur le téléphone.
