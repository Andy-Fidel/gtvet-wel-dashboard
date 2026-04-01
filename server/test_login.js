async function testLogin() {
  try {
    const res = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'superadmin@gtvet.gov.gh', password: 'password123' })
    });
    const data = await res.json();
    console.log(res.status, data);

    const res2 = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'super@tvet.gov.gh', password: 'password123' })
    });
    const data2 = await res2.json();
    console.log(res2.status, data2);

  } catch (error) {
    console.error("Fetch error:", error);
  }
}
testLogin();
