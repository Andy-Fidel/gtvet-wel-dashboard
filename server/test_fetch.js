async function run() {
  try {
    const email = process.env.TEST_LOGIN_EMAIL;
    const password = process.env.TEST_LOGIN_PASSWORD;
    if (!email || !password) {
      throw new Error('Set TEST_LOGIN_EMAIL and TEST_LOGIN_PASSWORD before running this script');
    }

    const loginRes = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const { token } = await loginRes.json();
    if (!token) {
        console.log("No token, try another user.");
        return;
    }
    
    console.log("Logged in. Fetching learners...");
    const lr = await fetch('http://localhost:5001/api/learners', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const learners = await lr.json();
    if (learners.length === 0) {
       console.log("No learners found");
       return;
    }
    const id = learners[0]._id;
    console.log("Learner ID:", id);
    
    console.log("Fetching profile...");
    const pr = await fetch(`http://localhost:5001/api/learners/${id}/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const profile = await pr.json();
    console.log("Profile Result:", pr.status, profile);
  } catch(e) {
    console.error(e);
  }
}
run();
