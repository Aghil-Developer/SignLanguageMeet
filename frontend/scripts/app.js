document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('mouna-theme') || 'mongodb';
  if (savedTheme === 'vibranium') {
    document.body.classList.add('theme-vibranium');
  }

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

async function createRoom() {
  try {
    const res = await fetch('/api/room/create');
    const data = await res.json();
    window.location.href = `/call?room=${data.roomId}`;
  } catch (err) {
    alert('Failed to create room. Please try again.');
  }
}


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
