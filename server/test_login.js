async function testLogin() {
  try {
    const email = process.env.TEST_LOGIN_EMAIL;
    const password = process.env.TEST_LOGIN_PASSWORD;
    if (!email || !password) {
      throw new Error('Set TEST_LOGIN_EMAIL and TEST_LOGIN_PASSWORD before running this script');
    }

    const res = await fetch('http://localhost:5001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    console.log(res.status, data);
  } catch (error) {
    console.error("Fetch error:", error);
  }
}
testLogin();
