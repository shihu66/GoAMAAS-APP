(function () {
  var p = window.location.pathname;
  if (p === '/admin' || p.indexOf('/admin/') === 0) {
    document.title = 'GoAMAAS Admin — AMAAS Technologies';
    var head = document.head;
    var existingRobots = document.querySelector('meta[name="robots"]');
    if (existingRobots && existingRobots.parentNode) existingRobots.parentNode.removeChild(existingRobots);
    var existingCanonical = document.querySelector('link[rel="canonical"]');
    if (existingCanonical && existingCanonical.parentNode) existingCanonical.parentNode.removeChild(existingCanonical);
    var existingIcon = document.querySelector('link[rel="icon"]');
    if (existingIcon && existingIcon.parentNode) existingIcon.parentNode.removeChild(existingIcon);
    var existingJsonLd = document.getElementById('goamaas-jsonld');
    if (existingJsonLd && existingJsonLd.parentNode) existingJsonLd.parentNode.removeChild(existingJsonLd);
    function meta(name, content) {
      var m = document.createElement('meta');
      m.setAttribute('name', name);
      m.setAttribute('content', content);
      head.appendChild(m);
    }
    function link(rel, href, type) {
      var l = document.createElement('link');
      l.setAttribute('rel', rel);
      l.setAttribute('href', href);
      if (type) l.setAttribute('type', type);
      head.appendChild(l);
    }
    meta('robots', 'noindex, nofollow, noarchive');
    meta('googlebot', 'noindex, nofollow, noarchive');
    meta('theme-color', '#090D16');
    meta('mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-capable', 'yes');
    meta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    meta('apple-mobile-web-app-title', 'AMAAS Admin');
    link('manifest', '/admin-manifest.webmanifest');
    link('apple-touch-icon', '/admin-apple-touch-icon.png');
    link('icon', '/admin-icon.svg', 'image/svg+xml');
  }
})();
