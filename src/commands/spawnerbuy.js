const { makeCalc } = require('../calc');

module.exports = makeCalc({
  name: 'spawnerbuy',
  description: 'Calculate the total cost to BUY spawners from me',
  side: 'buy',
  title: 'Spawner Buy Calculator',
});
