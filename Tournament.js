const mongoose = require("mongoose");

const tournamentSchema = new mongoose.Schema({
    tournamentName: {
        type: String,
        required: true,
        trim: true
    },
    sport: {
        type: String,
        required: true,
        trim: true
    },
    startDate: {
        type: String,
        required: true
    },
    endDate: {
        type: String,
        required: true
    },
    venue: {
        type: String,
        required: true,
        trim: true
    },
    numberOfTeams: {
        type: Number,
        required: true,
        min: 2,
        max: 32
    },
    format: {
        type: String,
        enum: ["League", "Knockout"],
        required: true
    },
    status: {
        type: String,
        enum: ["Upcoming", "Ongoing", "Completed"],
        default: "Upcoming"
    },
    teams: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    }],
    champion: {
        type: String,
        default: ""
    },
    championId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: "tournaments" });

module.exports = mongoose.model("Tournament", tournamentSchema);