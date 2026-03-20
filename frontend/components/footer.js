function renderFooter() {
  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <span class="navbar-logo">MOUNA</span>
          <p>Real-time speech to sign language communication platform. Breaking barriers for the deaf community.</p>
        </div>
        <div class="footer-col">
          <h4>Platform</h4>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/features">Features</a>
          <a href="/contact">Contact</a>
        </div>
        <div class="footer-col">
          <h4>Features</h4>
          <a href="/call">Video Calling</a>
          <a href="/features">Sign Language</a>
          <a href="/features">Subtitles</a>
          <a href="/features">Speech Recognition</a>
        </div>
        <div class="footer-col">
          <h4>Connect</h4>
          <a href="/call">Join a Room</a>
          <a href="/contact">Get in Touch</a>
        </div>
      </div>
      <div class="footer-bottom">
        &copy; ${new Date().getFullYear()} MOUNA. Built for accessibility. All rights reserved.
      </div>
    </div>
  `;
  document.body.appendChild(footer);
}
