# OVHcloud SMS

Relevé le 2026-11-01. Seul ce qui figure ici est utilisé par `OvhSmsNotifier` : tout le reste est à relire à la source avant de s'en servir.

## Sources

- Schéma de l'API : <https://eu.api.ovh.com/1.0/sms.json> (`basePath` : `https://eu.api.ovh.com/1.0`)
- <https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/api-sms-cookbook>
- <https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/send-sms-api-nodejs>
- <https://docs.ovhcloud.com/en/guides/web-cloud/messaging/sms/send-sms-http2sms.md>
- <https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/sms-users>
- <https://docs.ovhcloud.com/fr/guides/web-cloud/messaging/sms/sms-with-reply.md>
- <https://docs.ovhcloud.com/fr/guides/manage-and-operate/api/first-steps>
- Client officiel, pour les en-têtes : <https://github.com/ovh/node-ovh>

## Authentification

- Trois secrets : clé d'application (AK), clé secrète (AS), consumer key (CK).
- Signature (first-steps) : `"$1$" + SHA1_HEX(AS+"+"+CK+"+"+METHOD+"+"+QUERY+"+"+BODY+"+"+TSTAMP)`. `QUERY` est l'URL complète.
- En-têtes (node-ovh) : `X-Ovh-Application`, `X-Ovh-Timestamp`, `X-Ovh-Consumer`, `X-Ovh-Signature`.
- Horloge du serveur : `GET /auth/time` (node-ovh), secondes depuis l'époque Unix.
- Droits du jeton pour notre usage : `POST /sms/*/jobs`, `GET /sms/*/outgoing/*`, `GET /sms/*/blacklists`, `DELETE /sms/*/blacklists/*`.

## Envoi

`POST /sms/{serviceName}/jobs` (réponse `sms.SmsSendingReportUser`).

| Champ | Type | Note |
|---|---|---|
| `message` | string, requis | |
| `receivers` | string[] | Format international ; la réponse rend `+33600000000` |
| `sender` | string | |
| `senderForResponse` | boolean | Numéro court, France seulement ; non utilisé |
| `noStopClause` | boolean | « Do not display STOP clause in the message, this requires that this is not an advertising message » |
| `tag` | string | |
| `validityPeriod` | long | Minutes avant abandon |

Réponse : `ids: long[]`, `validReceivers`, `invalidReceivers`, `totalCreditsRemoved`, `creditsLeft`, `tag`.

**Mention STOP** : ajoutée par OVH (« STOP on XXXXX », http2sms), 11 caractères déduits du premier SMS (cookbook). Nous ne l'écrivons jamais nous-mêmes et n'utilisons jamais `noStopClause`.

**Longueurs** avec mention : GSM 7 bits, 149 caractères au premier SMS et 153 aux suivants ; Unicode, 59 puis 70. Un crédit par segment. Les caractères de la table « Extensions » comptent double.

## Lecture d'un envoi

`GET /sms/{serviceName}/outgoing/{id}` (`sms.Outgoing`) : `credits`, `deliveredAt` (nullable), `deliveryReceipt` (long), `numberOfSms`, `ptt`, `sentAt`.

Codes `ptt` (sms-users, liste non exhaustive ; `GET /sms/ptts` pour le détail) :

| ptt | Sens | Traduction chez nous |
|---|---|---|
| 1, 2, 3, 24, 25, 26 | Nouvel essai, accepté par l'opérateur, échec temporaire | En cours |
| 4 | « Le message a été livré » | Délivré |
| 5, 8, 20, 23, 27, 28, 29 | Non livré, expiré, non livrable, numéro invalide ou en liste noire, combiné incompatible, spam, contenu refusé | Échec |
| 6 et les autres | Inconnu | En cours |

## STOP

- `GET /sms/{serviceName}/blacklists` : `string[]` des numéros, « Pour suivre l'évolution de vos STOP SMS » (cookbook). Filtres : `batchID`, `smsOutgoingID`.
- `GET /sms/{serviceName}/blacklists/{number}` : `sms.Blacklist` (`dateCreation`, `number`, `smsOutgoingID`).
- `DELETE /sms/{serviceName}/blacklists/{number}`.

La route est au niveau du compte.

## Callbacks : non utilisés

`sms.Account` porte `callBack` et `stopCallBack`. Ni signature ni authentification n'y sont documentées, ni la forme du corps : un tiers pourrait forger un STOP ou un accusé. Nous relisons donc l'API (ADR-034).

## À VÉRIFIER avec un compte réel

- Durée de conservation des envois lisibles par `outgoing/{id}`.
- Une liste noire bloque-t-elle bien les envois suivants du compte ? La documentation ne le dit pas : notre garde à l'envoi ne s'y fie pas.
- Format exact accepté par `receivers` : `+33…` est rendu par l'API, l'exemple d'envoi écrit `0033…`.
- Délai réel entre la réponse STOP et son apparition dans `blacklists`.
