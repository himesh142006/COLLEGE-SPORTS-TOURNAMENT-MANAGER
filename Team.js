const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema({
    teamName: {
        type: String,
        required: true
    },
    sport: {
        type: String,
        required: true
    },
    captain: {
        type: String,
        required: true
    }
});

module.exports = mongoose.model("Team", teamSchema, "teams");