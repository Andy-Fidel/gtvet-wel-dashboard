async function x() {
  const token = (await (await fetch('http://localhost:5001/api/auth/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({email: 'steve.jobs@gtvets.edu.gh', password: 'password123'})
  })).json()).token;
  
  const learners = await (await fetch('http://localhost:5001/api/learners', {
    headers: { Authorization: `Bearer ${token}` }
  })).json();
  
  if (!learners.length) { console.log("No learners"); return; }
  
  for (const learner of learners) {
     const res = await fetch(`http://localhost:5001/api/learners/${learner._id}/profile`, {
        headers: { Authorization: `Bearer ${token}` }
     });
     console.log(learner._id, res.status, await res.text());
  }
}
x();
