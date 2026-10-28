const mongoose = require("mongoose");

const fixtureSchema = new mongoose.Schema({
    tournamentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tournament"
    },
    team1Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    team2Id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    team1: {
        type: String,
        required: true
    },
    team2: {
        type: String,
        required: true
    },
    matchDate: {
        type: String,
        required: true
    },
    matchTime: {
        type: String,
        required: true
    },
    venue: {
        type: String,
        required: true
    },
    date: {
        type: String
    },
    time: {
        type: String
    },
    round: {
        type: String,
        default: "League"
    },
    roundNumber: {
        type: Number,
        default: 1
    },
    bracketSlot: {
        type: Number
    },
    status: {
        type: String,
        enum: ["Scheduled", "Completed"],
        default: "Scheduled"
    },
    winner: {
        type: String
    },
    winnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team"
    },
    generated: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model("Fixture", fixtureSchema, "fixtures");