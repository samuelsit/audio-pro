# Scaleway Transactional Email

Relevé le 2026-11-01. Le site de documentation refuse les lectures automatisées : la source est le dépôt public de cette même documentation et le SDK officiel. Seul ce qui figure ici est utilisé par `ScalewayEmailNotifier`.

## Sources

Dans <https://github.com/scaleway/docs-content> (`pages/`) :

- `transactional-email/api-cli/send-emails-with-api.mdx`
- `transactional-email/api-cli/use-webhooks-with-sns-topics.mdx`
- `transactional-email/reference-content/webhook-events-payloads.mdx`
- `transactional-email/reference-content/data-privacy.mdx`
- `transactional-email/reference-content/tem-capabilities-and-limits.mdx`
- `transactional-email/reference-content/smtp-configuration.mdx`
- `topics-and-events/reference-content/verifying-webhooks.mdx`

SDK : <https://github.com/scaleway/scaleway-sdk-js>, `packages_generated/tem/src/v1alpha1/` (`types.gen.ts`, `api.gen.ts`).

## Envoi

`POST https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails`, en-tête `X-Auth-Token` (clé secrète de l'API).

| Champ | Note |
|---|---|
| `from` | `{ email, name }`, domaine vérifié du projet |
| `to` | `[{ email, name }]` |
| `subject` | « Subjects must have at least 10 characters » |
| `text`, `html` | Tous deux requis par le SDK |
| `project_id` | |
| `attachments` | `[{ name, type, content }]`, contenu en base64 |
| `additional_headers` | `[{ key, value }]` ; l'exemple officiel y met `Reply-To` |

Réponse : `{ "emails": [{ "id", "message_id", "status", … }] }`. `status` vaut alors `new`.

Limites : 2 Mo par e-mail en API, pièces jointes comprises ; 10 pièces jointes ; 10 000 e-mails par mois par défaut, quota extensible. PDF et texte admis.

## Lecture d'un envoi

`GET /transactional-email/v1alpha1/regions/fr-par/emails/{id}`.

| `status` | Traduction chez nous |
|---|---|
| `unknown`, `new`, `sending` | En cours |
| `sent` | Délivré. L'exemple officiel : `status_details` « success », `last_tries[].code` 250 |
| `failed`, `canceled` | Échec |

`flags` (SDK) : `soft_bounce`, `hard_bounce`, `spam`, `mailbox_full`, `mailbox_not_found`, `greylisted`, `send_before_expiration`, `blocklisted`.

## Données

« Transactional Email is only available in the following region: Paris, France (fr-par). Email content, metadata, logs, webhook data, and backups are stored and processed in France. » (data-privacy)

Le corps est effacé dès l'acceptation par le serveur destinataire, au premier rejet définitif, ou après 36 heures d'échecs temporaires.

## Webhooks : non utilisés

Ils passent par Topics & Events (`sns_arn`), avec un quota bêta à demander. `verifying-webhooks.mdx` impose de valider `SigningCertURL` par la chaîne de confiance, mais ne décrit ni le contenu signé, ni l'algorithme. Écrire cette vérification reviendrait à deviner un format : nous relisons l'API (ADR-034).

## À VÉRIFIER avec un compte réel

- Les en-têtes `List-Unsubscribe` et `List-Unsubscribe-Post` passent-ils par `additional_headers` ? La documentation ne liste pas les en-têtes admis.
- Durée pendant laquelle `GET emails/{id}` répond.
- `from` doit appartenir à un domaine vérifié : les centres écrivent depuis un domaine éditeur, leur adresse passe en `Reply-To`.
