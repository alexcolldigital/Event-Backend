/**
 * Location Model
 * Admin-managed states, LGAs, and towns.
 * Seed data (5 SE states) lives in frontend/src/utils/nigeriaLocations.js.
 * Admin can add more states/LGAs/towns from the dashboard.
 */

const mongoose = require('mongoose');

const lgaSchema = new mongoose.Schema({
  lga: { type: String, required: true, trim: true },
  towns: [{ type: String, trim: true }],
});

const locationSchema = new mongoose.Schema(
  {
    state: { type: String, required: true, trim: true, unique: true },
    lgas: [lgaSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Location', locationSchema);
