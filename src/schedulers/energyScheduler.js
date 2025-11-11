const cron = require("node-cron");
const User = require("../models/user");
const { processUserInterval } = require("../controllers/EnergyProductionController");

// run every 5 minutes (server local time)
const startEnergyScheduler = (opts = {}) => {
  const intervalMinutes = opts.intervalMinutes || 5;

  // cron expression: every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      console.log("[energyScheduler] starting run", new Date().toISOString());
      // select active users with solarPanel defined (avoid deleted)
      const users = await User.find({ status: "active", isDeleted: false, "solarPanel.size": { $exists: true } }).select("_id").lean();

      // process sequentially or in small parallel batches to avoid API rate limits
      for (const u of users) {
        try {
          const res = await processUserInterval(u._id, intervalMinutes);
          // optionally log or push to a queue
        } catch (err) {
          console.error("[energyScheduler] user error", u._id, err.message);
        }
      }

      console.log("[energyScheduler] finished run", new Date().toISOString());
    } catch (err) {
      console.error("[energyScheduler] run failed:", err.message);
    }
  }, { scheduled: true });
};

module.exports = startEnergyScheduler;