const { promisify } = require('util');
const googleAuth = require('google-auto-auth');

module.exports = {
  generateToken,
};

//gcloud auth print-access-token
function generateToken() {
  const auth = googleAuth();
  return new Promise((resolve, reject) => {
    auth.getToken((err, token) => {
      if (err) return reject(err);
      resolve(token);
    });
  });
}
