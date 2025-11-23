const { server } = require('./app');
const startEnergyScheduler = require("./schedulers/energyScheduler");

const PORT = process.env.PORT || 2020;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
startEnergyScheduler({ intervalMinutes: 5 });
