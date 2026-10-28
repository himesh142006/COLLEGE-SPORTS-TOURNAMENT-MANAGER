const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();
const Team = require("./Team");
const Fixture = require("./Fixture");
const Result = require("./Result");
const Tournament = require("./Tournament");
const Standing = require("./Standing");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Allow JSON data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
        return false;
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

function validateTournamentData(data) {
    const tournamentName = String(data.tournamentName || "").trim();
    const sport = String(data.sport || "").trim();
    const startDate = String(data.startDate || "").trim();
    const endDate = String(data.endDate || "").trim();
    const venue = String(data.venue || "").trim();
    const numberOfTeams = Number(data.numberOfTeams);
    const format = String(data.format || "");

    if (!tournamentName || !sport || !venue || !isValidDate(startDate) || !isValidDate(endDate) ||
        endDate < startDate || !Number.isInteger(numberOfTeams) || numberOfTeams < 2 || numberOfTeams > 32 ||
        !["League", "Knockout"].includes(format)) {
        return { error: "Enter a name, sport, venue, valid date range, team count (2-32), and format." };
    }

    return { tournamentName, sport, startDate, endDate, venue, numberOfTeams, format };
}

function getRoundName(teamCount, roundNumber) {
    const teamsInRound = Math.ceil(teamCount / (2 ** (roundNumber - 1)));
    if (teamsInRound === 2) return "Final";
    if (teamsInRound === 4) return "Semi Final";
    if (teamsInRound === 8) return "Quarter Final";
    if (teamsInRound > 8) return `Round of ${teamsInRound}`;
    return `Round ${roundNumber}`;
}

async function createKnockoutRound(tournament, teams, roundNumber) {
    const roundName = getRoundName(tournament.numberOfTeams, roundNumber);
    const fixtures = [];
    const matchCount = Math.floor(teams.length / 2);

    for (let index = 0; index < matchCount; index += 1) {
        const team1 = teams[index * 2];
        const team2 = teams[index * 2 + 1];
        fixtures.push({
            tournamentId: tournament._id,
            team1Id: team1._id,
            team2Id: team2._id,
            team1: team1.teamName,
            team2: team2.teamName,
            matchDate: tournament.startDate,
            matchTime: "12:00",
            venue: tournament.venue,
            round: roundName,
            roundNumber,
            bracketSlot: index,
            status: "Scheduled",
            generated: true
        });
    }

    if (teams.length % 2 === 1) {
        const byeTeam = teams[teams.length - 1];
        fixtures.push({
            tournamentId: tournament._id,
            team1Id: byeTeam._id,
            team1: byeTeam.teamName,
            team2: "BYE",
            matchDate: tournament.startDate,
            matchTime: "12:00",
            venue: tournament.venue,
            round: roundName,
            roundNumber,
            bracketSlot: matchCount,
            status: "Completed",
            winner: byeTeam.teamName,
            winnerId: byeTeam._id,
            generated: true
        });
    }

    if (fixtures.length) {
        await Fixture.insertMany(fixtures);
    }
    return fixtures;
}

async function recalculateStandings(tournament) {
    const teams = await getOrderedTeams(tournament.teams);
    const results = await Result.find({ tournamentId: tournament._id });
    const standingsById = new Map(teams.map((team) => [String(team._id), {
        tournamentId: tournament._id,
        teamId: team._id,
        teamName: team.teamName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        points: 0,
        scoreFor: 0,
        scoreAgainst: 0,
        scoreDifference: 0,
        position: 0
    }]));
    const standingsByName = new Map(teams.map((team) => [team.teamName, standingsById.get(String(team._id))]));

    for (const result of results) {
        const first = result.team1Id ? standingsById.get(String(result.team1Id)) : standingsByName.get(result.team1);
        const second = result.team2Id ? standingsById.get(String(result.team2Id)) : standingsByName.get(result.team2);
        if (!first || !second) continue;

        first.played += 1;
        second.played += 1;
        first.scoreFor += result.score1;
        first.scoreAgainst += result.score2;
        second.scoreFor += result.score2;
        second.scoreAgainst += result.score1;

        if (result.score1 === result.score2) {
            first.drawn += 1;
            second.drawn += 1;
            first.points += 1;
            second.points += 1;
        } else if (result.score1 > result.score2) {
            first.won += 1;
            first.points += 3;
            second.lost += 1;
        } else {
            second.won += 1;
            second.points += 3;
            first.lost += 1;
        }
    }

    const standings = [...standingsById.values()]
        .map((entry) => ({ ...entry, scoreDifference: entry.scoreFor - entry.scoreAgainst }))
        .sort((first, second) => second.points - first.points || second.won - first.won ||
            second.scoreDifference - first.scoreDifference || first.teamName.localeCompare(second.teamName));

    const updatedAt = new Date();
    const operations = standings.map((standing, index) => {
        const { tournamentId, teamId, ...values } = standing;
        return {
            updateOne: {
                filter: { tournamentId, teamId },
                update: {
                    $set: { ...values, position: index + 1, updatedAt },
                    $setOnInsert: { tournamentId, teamId }
                },
                upsert: true
            }
        };
    });

    if (operations.length) {
        try {
            await Standing.bulkWrite(operations);
        } catch (error) {
            if (error.code !== 11000) throw error;
            await Standing.bulkWrite(operations);
        }
    }
    await Standing.deleteMany({ tournamentId: tournament._id, teamId: { $nin: teams.map((team) => team._id) } });
    return Standing.find({ tournamentId: tournament._id }).sort({ position: 1 });
}

async function getOrderedTeams(teamIds) {
    const teams = await Team.find({ _id: { $in: teamIds } });
    const byId = new Map(teams.map((team) => [String(team._id), team]));
    return teamIds.map((teamId) => byId.get(String(teamId))).filter(Boolean);
}

async function getTournamentProgress(tournament) {
    const totalMatches = tournament.format === "League"
        ? tournament.numberOfTeams * (tournament.numberOfTeams - 1) / 2
        : tournament.numberOfTeams - 1;
    const completedMatches = await Result.countDocuments({ tournamentId: tournament._id });
    return {
        totalMatches,
        completedMatches,
        percentage: totalMatches ? Math.round(completedMatches / totalMatches * 100) : 0
    };
}

async function completeTournament(tournament, champion) {
    tournament.status = "Completed";
    tournament.champion = champion.teamName;
    tournament.championId = champion._id;
    await tournament.save();
}

async function advanceKnockoutTournament(tournament, roundNumber) {
    const roundFixtures = await Fixture.find({ tournamentId: tournament._id, roundNumber }).sort({ bracketSlot: 1 });
    const matches = roundFixtures.filter((fixture) => fixture.team2 !== "BYE");
    if (!matches.length || matches.some((fixture) => fixture.status !== "Completed")) {
        return;
    }

    const winners = [];
    for (const fixture of roundFixtures) {
        if (!fixture.winnerId) continue;
        const winner = await Team.findById(fixture.winnerId);
        if (winner) winners.push(winner);
    }

    if (winners.length === 1) {
        await completeTournament(tournament, winners[0]);
        return;
    }

    const nextRoundNumber = roundNumber + 1;
    const nextRoundExists = await Fixture.exists({ tournamentId: tournament._id, roundNumber: nextRoundNumber });
    if (!nextRoundExists) {
        await createKnockoutRound(tournament, winners, nextRoundNumber);
    }
}

app.get("/api/tournaments", async (req, res) => {
    try {
        const tournaments = await Tournament.find().populate("teams", "teamName sport").sort({ createdAt: -1 });
        const items = await Promise.all(tournaments.map(async (tournament) => ({
            ...tournament.toObject(),
            progress: await getTournamentProgress(tournament)
        })));
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: "Error loading tournaments", error: error.message });
    }
});

app.post("/api/tournaments", async (req, res) => {
    try {
        const data = validateTournamentData(req.body);
        if (data.error) return res.status(400).json({ message: data.error });

        const tournament = await Tournament.create(data);
        res.status(201).json({ message: "Tournament created", tournament });
    } catch (error) {
        res.status(error.name === "ValidationError" ? 400 : 500).json({ message: "Error creating tournament", error: error.message });
    }
});

app.get("/api/tournaments/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id).populate("teams", "teamName sport");
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        const [progress, fixtures] = await Promise.all([
            getTournamentProgress(tournament),
            Fixture.find({ tournamentId: tournament._id }).sort({ roundNumber: 1, bracketSlot: 1, _id: 1 })
        ]);
        res.json({ tournament, progress, fixtures });
    } catch (error) {
        res.status(500).json({ message: "Error loading tournament", error: error.message });
    }
});

app.put("/api/tournaments/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        if (tournament.status !== "Upcoming" || await Fixture.exists({ tournamentId: tournament._id })) {
            return res.status(409).json({ message: "Only an upcoming tournament without fixtures can be edited." });
        }

        const data = validateTournamentData({ ...tournament.toObject(), ...req.body });
        if (data.error) return res.status(400).json({ message: data.error });
        Object.assign(tournament, data);
        await tournament.save();
        res.json({ message: "Tournament updated", tournament });
    } catch (error) {
        res.status(500).json({ message: "Error updating tournament", error: error.message });
    }
});

app.put("/api/tournaments/:id/teams", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        if (tournament.status !== "Upcoming" || await Fixture.exists({ tournamentId: tournament._id })) {
            return res.status(409).json({ message: "Teams can only be assigned before the tournament starts." });
        }

        const teamIds = req.body.teamIds;
        if (!Array.isArray(teamIds) || teamIds.some((id) => !mongoose.isValidObjectId(id)) ||
            new Set(teamIds.map(String)).size !== teamIds.length || teamIds.length > tournament.numberOfTeams) {
            return res.status(400).json({ message: "Choose unique valid teams, up to the tournament capacity." });
        }
        const teams = await Team.find({ _id: { $in: teamIds } });
        if (teams.length !== teamIds.length) return res.status(400).json({ message: "One or more selected teams no longer exist." });

        tournament.teams = teamIds;
        await tournament.save();
        if (tournament.format === "League") await recalculateStandings(tournament);
        res.json({ message: "Tournament teams updated", tournament: await Tournament.findById(tournament._id).populate("teams", "teamName sport") });
    } catch (error) {
        res.status(500).json({ message: "Error assigning teams", error: error.message });
    }
});

app.post("/api/tournaments/:id/start", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        if (tournament.status !== "Upcoming") return res.status(409).json({ message: "Tournament has already started." });
        if (tournament.teams.length !== tournament.numberOfTeams) {
            return res.status(400).json({ message: `Select exactly ${tournament.numberOfTeams} teams before starting.` });
        }

        tournament.status = "Ongoing";
        await tournament.save();
        if (tournament.format === "League") await recalculateStandings(tournament);
        res.json({ message: "Tournament started", tournament });
    } catch (error) {
        res.status(500).json({ message: "Error starting tournament", error: error.message });
    }
});

app.post("/api/tournaments/:id/generate-fixtures", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        if (tournament.status !== "Ongoing" || tournament.teams.length !== tournament.numberOfTeams) {
            return res.status(400).json({ message: "Start the tournament with its full team list before generating fixtures." });
        }
        if (await Fixture.exists({ tournamentId: tournament._id })) {
            return res.status(409).json({ message: "Fixtures already exist for this tournament." });
        }

        const teams = await Team.find({ _id: { $in: tournament.teams } });
        const fixtures = [];
        if (tournament.format === "League") {
            for (let first = 0; first < teams.length; first += 1) {
                for (let second = first + 1; second < teams.length; second += 1) {
                    fixtures.push({
                        tournamentId: tournament._id,
                        team1Id: teams[first]._id,
                        team2Id: teams[second]._id,
                        team1: teams[first].teamName,
                        team2: teams[second].teamName,
                        matchDate: tournament.startDate,
                        matchTime: "12:00",
                        venue: tournament.venue,
                        round: "League",
                        roundNumber: 1,
                        bracketSlot: fixtures.length,
                        status: "Scheduled",
                        generated: true
                    });
                }
            }
            await Fixture.insertMany(fixtures);
        } else {
            await createKnockoutRound(tournament, teams, 1);
        }

        res.status(201).json({ message: "Fixtures generated", fixtures: await Fixture.find({ tournamentId: tournament._id }).sort({ roundNumber: 1, bracketSlot: 1 }) });
    } catch (error) {
        res.status(500).json({ message: "Error generating fixtures", error: error.message });
    }
});

app.get("/api/tournaments/:id/standings", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        if (tournament.format !== "League") return res.status(400).json({ message: "Standings are available for league tournaments only." });
        res.json(await recalculateStandings(tournament));
    } catch (error) {
        res.status(500).json({ message: "Error calculating standings", error: error.message });
    }
});

app.get("/api/tournaments/:id/progress", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });
        res.json({
            tournamentId: tournament._id,
            status: tournament.status,
            champion: tournament.champion,
            ...(await getTournamentProgress(tournament))
        });
    } catch (error) {
        res.status(500).json({ message: "Error loading tournament progress", error: error.message });
    }
});

app.delete("/api/tournaments/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid tournament ID." });
        const tournament = await Tournament.findById(req.params.id);
        if (!tournament) return res.status(404).json({ message: "Tournament not found." });

        const fixtureIds = await Fixture.distinct("_id", { tournamentId: tournament._id });
        await Result.deleteMany({ $or: [{ tournamentId: tournament._id }, { fixtureId: { $in: fixtureIds } }] });
        await Fixture.deleteMany({ tournamentId: tournament._id });
        await Standing.deleteMany({ tournamentId: tournament._id });
        await tournament.deleteOne();
        res.json({ message: "Tournament and its fixtures/results deleted." });
    } catch (error) {
        res.status(500).json({ message: "Error deleting tournament", error: error.message });
    }
});

app.get("/api/teams", async (req, res) => {
    try {
        const teams = await Team.find().sort({ createdAt: 1, _id: 1 });
        res.json(teams);
    } catch (error) {
        res.status(500).json({ message: "Error loading teams", error: error.message });
    }
});

app.post("/api/teams", async (req, res) => {
    try {
        const team = new Team({
            teamName: String(req.body.teamName || "").trim(),
            sport: String(req.body.sport || "").trim(),
            captain: String(req.body.captain || "").trim()
        });

        await team.save();
        res.status(201).json({ message: "Team saved successfully", team });
    } catch (error) {
        res.status(error.name === "ValidationError" ? 400 : 500).json({
            message: "Error saving team",
            error: error.message
        });
    }
});

app.get("/api/fixtures", async (req, res) => {
    try {
        const fixtures = await Fixture.find().sort({ matchDate: 1, matchTime: 1, _id: 1 });
        res.json(fixtures);
    } catch (error) {
        res.status(500).json({ message: "Error loading fixtures", error: error.message });
    }
});

app.post("/api/fixtures", async (req, res) => {
    try {
        const team1 = String(req.body.team1 || "").trim();
        const team2 = String(req.body.team2 || "").trim();
        const matchDate = String(req.body.matchDate || "").trim();
        const matchTime = String(req.body.matchTime || "").trim();
        const venue = String(req.body.venue || "").trim();

        if (!team1 || !team2 || team1 === team2 || !isValidDate(matchDate) || !isValidTime(matchTime) || !venue) {
            return res.status(400).json({ message: "Provide two different teams, date, time, and venue." });
        }

        const [team1Record, team2Record] = await Promise.all([
            Team.findOne({ teamName: team1 }),
            Team.findOne({ teamName: team2 })
        ]);
        const tournamentId = req.body.tournamentId || undefined;
        if (tournamentId && !mongoose.isValidObjectId(tournamentId)) {
            return res.status(400).json({ message: "Invalid tournament ID." });
        }
        if (tournamentId && await Fixture.exists({ tournamentId })) {
            return res.status(409).json({ message: "This tournament already has generated or scheduled fixtures." });
        }

        const fixture = new Fixture({
            tournamentId,
            team1Id: team1Record?._id,
            team2Id: team2Record?._id,
            team1,
            team2,
            matchDate,
            matchTime,
            venue,
            round: "Manual",
            generated: false
        });

        await fixture.save();
        res.status(201).json({ message: "Fixture saved successfully", fixture });
    } catch (error) {
        res.status(error.name === "ValidationError" ? 400 : 500).json({
            message: "Error saving fixture",
            error: error.message
        });
    }
});

app.put("/api/fixtures/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid fixture ID." });
        const fixture = await Fixture.findById(req.params.id);
        if (!fixture) return res.status(404).json({ message: "Fixture not found." });
        if (fixture.status === "Completed") return res.status(409).json({ message: "Completed fixtures cannot be rescheduled." });

        const matchDate = String(req.body.matchDate || "").trim();
        const matchTime = String(req.body.matchTime || "").trim();
        const venue = String(req.body.venue || "").trim();
        if (!isValidDate(matchDate) || !isValidTime(matchTime) || !venue) {
            return res.status(400).json({ message: "Provide a valid date, time, and venue." });
        }

        fixture.matchDate = matchDate;
        fixture.matchTime = matchTime;
        fixture.venue = venue;
        await fixture.save();
        res.json({ message: "Fixture schedule updated", fixture });
    } catch (error) {
        res.status(500).json({ message: "Error updating fixture", error: error.message });
    }
});

app.get("/api/results", async (req, res) => {
    try {
        const results = await Result.find().sort({ createdAt: -1, _id: -1 });
        res.json(results);
    } catch (error) {
        res.status(500).json({ message: "Error loading results", error: error.message });
    }
});

app.post("/api/results", async (req, res) => {
    try {
        const fixtureId = req.body.fixtureId || undefined;
        if (fixtureId && !mongoose.isValidObjectId(fixtureId)) {
            return res.status(400).json({ message: "Invalid fixture ID." });
        }
        const fixture = fixtureId ? await Fixture.findById(fixtureId) : null;
        if (fixtureId && !fixture) return res.status(404).json({ message: "Scheduled fixture not found." });
        if (fixture?.status === "Completed") return res.status(409).json({ message: "This fixture already has a result." });
        if (fixtureId && await Result.exists({ fixtureId })) return res.status(409).json({ message: "A result already exists for this fixture." });

        const team1 = fixture ? fixture.team1 : String(req.body.team1 || "").trim();
        const team2 = fixture ? fixture.team2 : String(req.body.team2 || "").trim();
        const score1Provided = req.body.score1 !== undefined && req.body.score1 !== null && String(req.body.score1).trim() !== "";
        const score2Provided = req.body.score2 !== undefined && req.body.score2 !== null && String(req.body.score2).trim() !== "";
        const score1 = Number(req.body.score1);
        const score2 = Number(req.body.score2);

        if (!team1 || !team2 || team1 === team2 || !score1Provided || !score2Provided ||
            !Number.isFinite(score1) || !Number.isFinite(score2) || score1 < 0 || score2 < 0) {
            return res.status(400).json({ message: "Provide different teams and valid non-negative scores." });
        }

        const tournament = fixture?.tournamentId ? await Tournament.findById(fixture.tournamentId) : null;
        if (tournament?.format === "Knockout" && score1 === score2) {
            return res.status(400).json({ message: "Knockout matches must have a winner. Enter the tie-break score so the scores differ." });
        }

        const winner = score1 > score2 ? team1 : score2 > score1 ? team2 : "Draw";
        const winnerId = winner === "Draw" ? undefined : winner === team1 ? fixture?.team1Id : fixture?.team2Id;
        const result = await Result.create({
            fixtureId: fixture?._id,
            tournamentId: fixture?.tournamentId,
            team1Id: fixture?.team1Id,
            team2Id: fixture?.team2Id,
            team1,
            score1,
            team2,
            score2,
            winner
        });

        if (fixture) {
            fixture.status = "Completed";
            fixture.winner = winner;
            fixture.winnerId = winnerId;
            await fixture.save();

            if (tournament?.format === "Knockout") {
                await advanceKnockoutTournament(tournament, fixture.roundNumber);
            } else if (tournament) {
                const standings = await recalculateStandings(tournament);
                const progress = await getTournamentProgress(tournament);
                if (progress.completedMatches >= progress.totalMatches) {
                    const champion = standings[0] && await Team.findById(standings[0].teamId);
                    if (champion) await completeTournament(tournament, champion);
                }
            }
        }

        res.status(201).json({
            message: "Result saved successfully",
            result,
            fixture,
            tournament: tournament ? await Tournament.findById(tournament._id) : null
        });
    } catch (error) {
        res.status(error.name === "ValidationError" ? 400 : 500).json({
            message: "Error saving result",
            error: error.message
        });
    }
});

app.use("/api", (req, res) => {
    res.status(404).json({ message: `API route not found: ${req.method} ${req.originalUrl}` });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.use(express.static(__dirname));

app.use((error, req, res, next) => {
    if (req.originalUrl.startsWith("/api")) {
        const status = error.status || 500;
        return res.status(status).json({
            message: status === 400 ? "Invalid API request." : "API request failed.",
            error: error.message
        });
    }
    next(error);
});

async function startServer() {
    if (!process.env.MONGO_URI) {
        console.error("MongoDB connection failed: MONGO_URI is not set in .env");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(process.env.MONGO_URI, { dbName: "SportsTournament" });
        console.log("MongoDB Connected Successfully");
        await Standing.init();
        const leagueTournaments = await Tournament.find({ format: "League" });
        for (const tournament of leagueTournaments) {
            await recalculateStandings(tournament);
        }

        const server = app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
        server.on("error", (error) => {
            if (error.code === "EADDRINUSE") {
                console.error(`Port ${PORT} is already in use. Stop the existing project server, then run node server.js again.`);
            } else {
                console.error("Server startup error:", error.message);
            }
            process.exitCode = 1;
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exitCode = 1;
    }
}

startServer();