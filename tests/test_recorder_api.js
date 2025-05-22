const fetch = require('node-fetch');

async function testRecorderAPI() {
  // Tester la liste des sessions
  const sessions = await fetch('http://localhost:3002/api/sessions')
    .then(res => res.json());
  console.log('Sessions:', sessions);

  if (sessions.length > 0) {
    // Tester les événements d'une session
    const events = await fetch(`http://localhost:3002/api/sessions/${sessions[0].id}/events`)
      .then(res => res.json());
    console.log('Events:', events);
  }
}

testRecorderAPI().catch(console.error); 