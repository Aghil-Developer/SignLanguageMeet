function renderNavbar(activePage) {
  const navbar = document.createElement('nav');
  navbar.className = 'navbar';
  navbar.innerHTML = `
    <div class="container">
      <a href="/" class="navbar-logo">MOUNA</a>
      <div class="navbar-menu" id="navMenu">
        <a href="/" class="${activePage === 'home' ? 'active' : ''}">Home</a>
        <a href="/about" class="${activePage === 'about' ? 'active' : ''}">About</a>
        <a href="/features" class="${activePage === 'features' ? 'active' : ''}">Features</a>
        <a href="/contact" class="${activePage === 'contact' ? 'active' : ''}">Contact</a>
        <a href="/call" class="${activePage === 'call' ? 'active' : ''}">Join Room</a>
      </div>
      <div class="navbar-actions">
        <button class="theme-toggle" id="themeToggle" title="Switch theme">🎨</button>
        <button class="hamburger" id="hamburger">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  `;
  document.body.prepend(navbar);

  const hamburger = document.getElementById('hamburger');
  const navMenu = document.getElementById('navMenu');
  hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('open');
  });


  const themeToggle = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('mouna-theme') || 'mongodb';
  if (savedTheme === 'vibranium') {
    document.body.classList.add('theme-vibranium');
  }
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('theme-vibranium');
    const current = document.body.classList.contains('theme-vibranium') ? 'vibranium' : 'mongodb';
    localStorage.setItem('mouna-theme', current);
  });
}
