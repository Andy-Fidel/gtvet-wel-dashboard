const http = require('http');

const loginData = JSON.stringify({ email: "steve.jobs@gtvets.edu.gh", password: "password123" }); // assuming a seed user exists

const req = http.request({
  hostname: 'localhost',
  port: 5001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const { token } = JSON.parse(data);
      if (!token) {
         console.log('Login failed:', data);
         return;
      }
      console.log('Got token');
      
      // Now fetch a learner list to get a real ID
      http.get('http://localhost:5001/api/learners', {
        headers: { 'Authorization': `Bearer ${token}` }
      }, (res2) => {
        let lData = '';
        res2.on('data', chunk => lData += chunk);
        res2.on('end', () => {
          const learners = JSON.parse(lData);
          if (learners.length === 0) { console.log("No learners"); return; }
          const learnerId = learners[0]._id;
          
          // Now fetch profile
          http.get(`http://localhost:5001/api/learners/${learnerId}/profile`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }, (res3) => {
             let pData = '';
             res3.on('data', chunk => pData += chunk);
             res3.on('end', () => {
                console.log('Profile Response:', res3.statusCode);
                console.log(pData);
             });
          });
        });
      });
      
    } catch(e) { console.log(e); }
  });
});

req.write(loginData);
req.end();
