// Le script n'injecte qu'une iframe : un formulaire monté dans la page tierce porterait son origine, et Next
// rejetterait ses server actions. `data-client` et `data-centre` désignent le centre.
const SCRIPT = `(function () {
  var script = document.currentScript;
  var origine = new URL(script.src).origin;
  var cadre = document.createElement('iframe');
  cadre.src = origine + '/rdv/' + encodeURIComponent(script.dataset.client) + '/' +
    encodeURIComponent(script.dataset.centre) + '?widget=1';
  cadre.title = 'Prendre rendez-vous';
  cadre.style.cssText = 'width:100%;min-height:640px;border:0';
  script.parentNode.insertBefore(cadre, script);
  window.addEventListener('message', function (evenement) {
    var donnees = evenement.data;
    if (evenement.origin === origine && evenement.source === cadre.contentWindow &&
        donnees && donnees.type === 'ha-rdv-hauteur') {
      cadre.style.height = donnees.hauteur + 'px';
    }
  });
})();
`;

export function GET(): Response {
  return new Response(SCRIPT, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
