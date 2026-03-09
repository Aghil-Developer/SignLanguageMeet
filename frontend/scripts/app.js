// MOUNA – Main App Script
document.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  const savedTheme = localStorage.getItem('mouna-theme') || 'mongodb';
  if (savedTheme === 'vibranium') {
    document.body.classList.add('theme-vibranium');
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
});

// Create Room helper
async function createRoom() {
  try {
    const res = await fetch('/api/room/create');
    const data = await res.json();
    window.location.href = `/call?room=${data.roomId}`;
  } catch (err) {
    alert('Failed to create room. Please try again.');
  }
}

// Join Room helper
function joinRoom() {
  const input = document.getElementById('roomIdInput');
  if (!input) return;
  const roomId = input.value.trim();
  if (!roomId) {
    alert('Please enter a Room ID');
    return;
  }
  window.location.href = `/call?room=${roomId}`;
}
