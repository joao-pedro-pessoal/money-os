// Injected by the Android app after each page load.
//
// The site saves exports and backups by clicking a link to a blob it has just
// made, then revokes the blob at once. A browser tab saves that file; a WebView
// silently does nothing. This keeps each blob long enough to read it and hands
// the bytes to the app, which writes them to the phone's Downloads folder.
//
// It also tells the app the page's background colour, so the status bar and the
// navigation bar match whichever of the site's themes is in use.
(function () {
  if (window.__moneyOsAndroid) return;
  window.__moneyOsAndroid = true;
  var bridge = window.MoneyOSAndroid;
  if (!bridge) return;

  var blobs = new Map();
  var create = URL.createObjectURL.bind(URL);
  var revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = function (object) {
    var url = create(object);
    if (object instanceof Blob) blobs.set(url, object);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    setTimeout(function () {
      blobs.delete(url);
      revoke(url);
    }, 60000);
  };

  function save(anchor) {
    if (!anchor.hasAttribute('download') || anchor.href.indexOf('blob:') !== 0) return false;
    var blob = blobs.get(anchor.href);
    if (!blob) return false;
    var reader = new FileReader();
    reader.onload = function () {
      var data = String(reader.result);
      bridge.saveFile(data.slice(data.indexOf(',') + 1), anchor.getAttribute('download') || '', blob.type || '');
    };
    reader.readAsDataURL(blob);
    return true;
  }

  // The site's links are created, clicked and dropped without ever joining the
  // page, so a click listener on the document never sees them.
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (save(this)) return;
    return click.apply(this, arguments);
  };
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[download]') : null;
    if (anchor && save(anchor)) event.preventDefault();
  }, true);

  var last = '';
  function sendColour() {
    var colour = getComputedStyle(document.body).backgroundColor;
    if (!colour || colour === 'transparent' || colour === 'rgba(0, 0, 0, 0)') {
      var meta = document.querySelector('meta[name="theme-color"]');
      colour = meta ? meta.getAttribute('content') : '';
    }
    if (colour && colour !== last) {
      last = colour;
      bridge.themeColor(colour);
    }
  }
  new MutationObserver(sendColour).observe(document.documentElement, { attributes: true });
  new MutationObserver(sendColour).observe(document.head, { attributes: true, childList: true, subtree: true });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sendColour);
  sendColour();
})();
