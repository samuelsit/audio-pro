/** Reprise telle quelle sur la facture (R27). Source : modele-devis-audio.pdf p. 2 § 4. */
export const GARANTIE_FABRICANT =
  'Une garantie minimale de 4 ans est assurée par le fabricant de l’appareil. Cette garantie couvre les vices de formes, défauts de fabrication, pannes survenant au cours d’un usage habituel (pièces, main d’œuvre et transport). Cette garantie produit ses effets, même si vous consultez un audioprothésiste différent de celui consulté lors de la délivrance de votre appareil et ayant réalisé le bilan initial. Des garanties légales de conformité et des vices cachés sont également applicables aux produits qui vous sont délivrés.';

/**
 * Textes du devis normalisé, mot pour mot, coquilles et mentions anciennes comprises (« CMU-c »,
 * « Dès 2020 », « votre opticien ») : ce fichier ne se corrige que sur un nouveau modèle officiel.
 * Source : modele-devis-audio.pdf p. 1 et 2.
 * Le HTML ne contient que la mise en forme du modèle. Aucune donnée saisie ne passe par ici.
 */
export const MODELE_DEVIS = {
  titre: 'ANNEXE I. - DEVIS NORMALISÉ RELATIF AUX AIDES AUDITIVES',
  sousTitre: '(à délivrer au patient avant tout achat d’aides auditives)',
  references:
    '(article L.165-9 du code de la sécurité sociale et L.112-1 du code de la consommation)',
  avertissement:
    'Ce devis vous est remis pour information, et ne vous engage pas à l’achat jusqu’à la signature du point 5. Les prix ci-dessous incluent les prestations d’adaptation indissociables de l’appareil proposé dont le suivi par l’audioprothésiste pendant toute la durée d’utilisation de l’aide auditive (voir détail au verso). La fiche technique présentant les principales spécificités de l’appareil proposé doit obligatoirement être jointe au devis.',
  offre100Sante:
    'Les équipements proposés dans l’offre 100% santé répondent à des exigences de qualité définies après avis de la Haute Autorité de santé. Le professionnel de santé s’engage à respecter le prix limite de vente défini. Ces aides auditives couvrent les besoins essentiels de la très grande majorité des malentendants. Elles disposent au minimum de 3 options parmi les suivantes : réducteur d’acouphène, connectivité sans fil, réducteur de bruit du vent, synchronisation binaurale, directivité microphonique adaptative, bande passante élargie ≥ 6 000Hz, apprentissage de sonie, réducteur de réverbération.',
  enteteOffres:
    'Aide(s) auditive(s) proposée(s) incluant tous les accessoires nécessaires au fonctionnement :',
  descriptionAide: `Nom et adresse du fabricant ou du mandataire si fabricant hors UE, marque, modèle, référence commerciale du catalogue du fabricant ;<br>Lieu de fabrication : UE ou hors UE (facultatif) ;<br>Caractéristiques essentielles, notamment :<br>- type, nombre de canaux ;<br>- dispositifs de connectivité (liste exhaustive, ex. télécommande, Bluetooth, etc.) ;<br>- anti-larsen (oui/non) ;<br>- réducteur d’acouphènes (oui/non) ;<br>- accessibilité de la boucle magnétique ou bobine T (oui/non)`,
  descriptionGauche:
    '<em>Mentionner les points sur lesquels le descriptif technique détaillé de l’aide auditive gauche diffère de l’aide auditive droite.</em>',
  descriptionConsommables: 'Marque, modèle, référence commerciale dans le catalogue du fabricant.',
  bobineT:
    'Les aides auditives avec bobine T (ou bobine magnétique à induction) disposent de programmes (position T ou MT) qui permettent une meilleure accessibilité du son dans différents environnements comprenant une boucle magnétique (télévision, téléphonie, salle de réunion, salles de spectacle, cinéma, etc.).',
  bobineTCase:
    'La présentation de la bobine T a été réalisée (informations explicatives, et démonstration de son utilisation)',
  essai: [
    '- L’aide auditive proposée doit être systématiquement confiée pour une période d’adaptation probatoire réalisée sur une période d’au moins 30 jours (qui peut être portée à 45 jours à la demande du prescripteur dans des cas spécifiques). Á l’issue de cette période, en cas d’échec, vous pouvez demander une nouvelle période d’adaptation avec une autre aide auditive.',
    '- L’essai est indissociable d’une prestation d’adaptation notamment des préréglages et ajustements anatomiques.',
    '- La réalisation de l’essai ne peut vous être facturée quand bien même vous ne procéderiez pas à l’achat final de l’aide auditive. Dans ce dernier cas, les embouts ou coques sur mesure peuvent toutefois vous être facturés. Aucune facturation de l’appareillage ne peut avoir lieu avant la fin de la période d’essai.',
  ],
  prestations: [
    'Toutes les prestations ci-dessous sont comprises dans le prix du devis. Hormis la personnalisation anatomique des embouts et coques fabriqués sur mesure, <strong>aucun frais supplémentaire ne peut donc vous être demandé, avant, pendant ou après l’achat de votre appareil, pour l’une de ces prestations</strong>.',
    '<strong>- votre prise en charge avant l’achat de l’aide auditive</strong> (notamment, analyse détaillée de vos antécédents auditifs, de vos capacités auditives ; l’examen de vos conduits auditifs ; la mesure de votre audition, de votre tolérance aux sons forts, de votre compréhension de la parole ; la prise d’empreinte de vos conduits auditifs externes, le cas échéant ; une information exhaustive sur les différents appareillages envisageables : utilisation, entretien, coût, conditions de remboursement par les organismes de prise en charge…).',
    '<strong>- l’adaptation de votre aide auditive, la délivrance et le contrôle immédiat de votre appareillage</strong> (notamment, le contrôle immédiat de l’efficacité prothétique en utilisant tous les tests audiométriques nécessaires ; une information exhaustive sur l’utilisation et l’entretien de votre aide auditive ; votre choix définitif de l’appareil ; la fourniture de l’indication du coût de votre appareil et du coût total de votre appareillage ; les contrôles d’efficacité et modifications de réglages ; tous les tests nécessaires), <strong>l’éducation prothétique</strong> (notamment, les conseils d’adaptation, de manipulation de votre appareil, l’information sur le changement et sur les conditions de remboursement des piles par les organismes de prise en charge, et l’information sur les conditions d’utilisation et sur l’entretien de votre aide auditive).',
    '<strong>- le suivi prothétique régulier et le contrôle permanent de votre aide auditive jusqu’à la fin d’utilisation de votre appareil</strong> (notamment, les séances de contrôle de l’efficacité de votre aide auditive aux <strong><u>3<sup>e</sup>, 6<sup>e</sup> et 12<sup>e</sup> mois</u></strong> après sa délivrance ; puis, <strong><u>au moins deux rendez-vous de suivi par an</u></strong> selon vos besoins ; tous les tests nécessaires à la vérification de l’efficacité de votre appareillage; la modification des réglages ainsi que l’entretien et les réparations nécessaires de votre appareil), la <strong>gestion administrative de votre dossier</strong> (notamment, l’élaboration du ou des compte (s) rendu (s) de votre appareillage au médecin prescripteur et au médecin traitant).',
    '<strong>En cas de déménagement ou lorsque vous souhaitez changer d’audioprothésiste, le professionnel de santé s’engage à faciliter le changement d’audioprothésiste réalisant le suivi prothétique.</strong>',
    GARANTIE_FABRICANT,
  ],
  autresInformations:
    'Autres informations pouvant figurer sur un document à part : acompte, délai de livraison, conditions générales de vente, assurance perte/vol/casse, autres produits ou prestations non remboursables, etc.',
  validation:
    'Á l’issue de la période d’essai, et en cas d’acceptation de votre part, une signature vous sera demandée, afin de valider la commande et formaliser votre engagement. La date de facturation marque la délivrance de l’appareil auditif.',
  note1:
    '<sup>1</sup> Seuls les produits et prestations remboursables par la Sécurité sociale peuvent être mentionnés dans cette rubrique.',
  note2:
    '<sup>2</sup> Dès 2020, ces solutions bénéficient d’un reste à charge maîtrisé. À compter de 2021, les aides auditives sont prises en charge à 100% par l’Assurance maladie obligatoire et complémentaire dès lors que vous êtes couvert par un contrat dit « responsable », contrat qui représente la grande majorité de ceux présents sur le marché, ou par la CMU-c ;',
  note3:
    '<sup>3</sup> Votre organisme complémentaire est tenu de vous informer du montant de prise en charge dont vous bénéficiez au regard des conditions particulières de votre contrat.',
  note4:
    '<sup>4</sup> Les informations de ce devis sont susceptibles de faire l’objet de traitements informatisés visant à votre prise en charge par l’audioprothésiste, et à la prise en charge des produits et prestations par l’Assurance maladie et par votre organisme complémentaire, à qui elles peuvent être transmises. En application du règlement général sur la protection des données et de la loi n°78-17 du 6 janvier 1978 dite « Informatique et libertés », vous disposez d’un droit d’accès, de rectification et d’opposition. Plus d’informations sont disponibles auprès de votre opticien et de votre organisme complémentaire.',
} as const;
