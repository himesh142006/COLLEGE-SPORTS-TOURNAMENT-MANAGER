const mongoose = require("mongoose");

const standingSchema = new mongoose.Schema({
    tournamentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tournament",
        required: true
    },
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Team",
        required: true
    },
    teamName: {
        type: String,
        required: true
    },
    played: {
        type: Number,
        default: 0,
        min: 0
    },
    won: {
        type: Number,
        default: 0,
        min: 0
    },
    drawn: {
        type: Number,
        default: 0,
        min: 0
    },
    lost: {
        type: Number,
        default: 0,
        min: 0
    },
    points: {
        type: Number,
        default: 0,
        min: 0
    },
    scoreFor: {
        type: Number,
        default: 0,
        min: 0
    },
    scoreAgainst: {
        type: Number,
        default: 0,
        min: 0
    },
    scoreDifference: {
        type: Number,
        default: 0
    },
    position: {
        type: Number,
        required: true,
        min: 1
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { collection: "standings" });

standingSchema.index({ tournamentId: 1, teamId: 1 }, { unique: true });

module.exports = mongoose.model("Standing", standingSchema);