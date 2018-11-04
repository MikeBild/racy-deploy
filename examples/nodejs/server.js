const express = require('express');
const pkg = require('./package.json');
const app = express();
app.get('/', (req, res) =>
  res.send({ message: `Hello from ${pkg.name}:${pkg.version}` }),
);
const server = app.listen(process.env.PORT, () => {
  console.log(`Listen on ${server.address().port}`);
});
