const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
    fixtureId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Fixture"
    },
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
        required: true,
        trim: true
    },
    score1: {
        type: Number,
        required: true,
        min: 0
    },
    team2: {
        type: String,
        required: true,
        trim: true
    },
    score2: {
        type: Number,
        required: true,
        min: 0
    },
    winner: {
        type: String,
        required: true
    }
}, { collection: "results", timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model("Result", resultSchema);