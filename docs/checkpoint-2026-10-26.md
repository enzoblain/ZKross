# Point de sauvegarde — 26 octobre 2026

Branche : `dev-front`. État intermédiaire, pas une version prête à ouvrir au public.

## Implémenté et vérifié

- Séparation stricte simulation/testnet ; aucun repli silencieux vers une simulation.
- Coffre local chiffré, sauvegarde/restauration, verrouillage et clés de lecture limitées à une note.
- Pool privé Ethereum sans GVK et vérificateur réel `policy_tx_2_2` ; preuve WASM réelle, dépôt/retrait et refus d’une double dépense vérifiés en local.
- Déploiement par signatures MetaMask/Freighter, journaux de reprise et contrôles des artefacts.
- Nouveau contrat Ethereum `CctpBatcher` : collecte de montants autorisés, un burn CCTP pour la somme, remboursements avant burn, expiration et burn solo explicitement signé. Neuf tests réussis avec un messenger simulé ; cela ne prouve pas encore un burn Circle réel.
- Nouvelle inbox Stellar par groupe, sans administrateur ni méthode de retrait arbitraire. Les allocations privées sont immuables. Deux tests réussis, dont l’autorisation réelle du transfert vers un pool de test, sans simulation générale des autorisations.
- Service de file partagée SQLite : intentions signées, regroupement de portefeuilles distincts, expiration proposant le choix solo sans le déclencher automatiquement, annulation avant regroupement. Cinq tests réussis.

## Implémenté mais encore en cours d’intégration

Les nouveaux modules navigateur préparent le dépôt collectif, l’attestation, le mint via le forwarder Circle, le dépôt SPP et le retrait vers l’adresse Stellar choisie. Ils ne sont pas encore branchés au parcours visible. Le site continue de bloquer le bridge réel. Les déclarations et interfaces de ces modules doivent être vérifiées sur les contrats publics avant leur activation.

## À terminer

1. Relier la nouvelle file et le nouveau moteur collectif à une interface Ethereum → Stellar unique : connexion, coffre, montant, destinataire, attente, choix solo, signatures, progression, reprise.
2. Préflight des frais Circle : cette version du contrat collectif impose un burn standard avec frais CCTP nuls. Ne pas l’activer si cette hypothèse n’est pas validée ; aucun frais ne doit être prélevé sur une allocation privée sans adaptation.
3. Finaliser les courses entre utilisateurs, la récupération des hashes perdus, l’archivage des événements et la reprise des enveloppes expirées. Le scan d’événements du prototype n’est pas un indexeur d’archive.
4. Recompiler et publier tous les artefacts ignorés (`public/zk`), vérifier leurs empreintes, déployer par les signatures de l’utilisateur, renseigner les adresses et points de départ des historiques.
5. Réussir un test réel à deux utilisateurs : un burn collectif → une attestation → un mint → deux dépôts privés → retraits. Réussir aussi le cas seul après attente, les remboursements et les interruptions.
6. Déployer le service persistant et le site HTTPS avec la bonne configuration CORS. Revoir la sécurité des contrats expérimentaux avant une ouverture large.

## Limites

Aucun nouveau déploiement public ni succès CCTP complet n’est revendiqué. Le batching ne garantit pas l’anonymat. Les montants, horaires et certaines relations restent publics ; un retrait vers un portefeuille Stellar ordinaire est public. Les contrôles d’audit/disclosure complets ne sont pas terminés. Le parcours inverse n’est pas l’objectif immédiat de cette interface.

## Vérifications du checkpoint

- Frontend : compilation réussie ; 97 tests réussis, trois tests locaux optionnels ignorés par la commande générale.
- File collective : cinq tests réussis.
- Ethereum : 178 tests réussis, dont neuf pour le contrat collectif.
- Stellar : 107 tests du pool et deux tests de l’inbox réussis.
- Lint frontend : aucune erreur ; trois avertissements sur des fichiers générés préexistants.

Les tests et sources préexistants sont préservés. Les nouvelles fonctionnalités non raccordées sont sauvegardées comme travail en cours, sans les présenter comme une plateforme testnet finalisée.
