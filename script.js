const appData = {
    teams: [],
    fixtures: [],
    results: [],
    tournaments: []
};

let activeTournament = null;

async function requestJson(url, options) {
    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        throw new Error("Unable to communicate with the server. Please make sure the Node.js server is running.");
    }

    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json") || /application\/[\w.+-]+\+json/i.test(contentType);
    if (!isJson) {
        throw new Error(`${url} returned HTTP ${response.status}, not JSON. Restart the project server with node server.js.`);
    }

    let data;
    try {
        data = await response.json();
    } catch (error) {
        throw new Error(`${url} returned invalid JSON. Check the Express API response.`);
    }
    if (!response.ok) {
        throw new Error(data.message || data.error || `The request failed with HTTP ${response.status}.`);
    }
    return data;
}

function showError(error) {
    console.error(error);
    alert(error.message || "Something went wrong. Please try again.");
}

function setMessage(id, message, isError = false) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle("is-error", isError);
}

function clearTable(table) {
    if (!table) return;
    if (table.tBodies.length) {
        table.tBodies[0].replaceChildren();
        return;
    }
    while (table.rows.length > 1) table.deleteRow(1);
}

function appendRow(table, values) {
    if (!table) return null;
    const row = table.tBodies.length ? table.tBodies[0].insertRow(-1) : table.insertRow(-1);
    values.forEach((value) => {
        row.insertCell().textContent = value ?? "";
    });
    return row;
}

function setEmptyState(id, empty, message) {
    const element = document.getElementById(id);
    if (!element) return;
    if (message) element.textContent = message;
    element.hidden = !empty;
}

function populateSelect(select, items, placeholder, valueFor, labelFor) {
    if (!select) return;
    const previousValue = select.value;
    select.replaceChildren(new Option(placeholder, ""));
    items.forEach((item) => select.add(new Option(labelFor(item), valueFor(item))));
    if (items.some((item) => String(valueFor(item)) === previousValue)) select.value = previousValue;
}

function populateTeamDropdown(select, teams) {
    populateSelect(select, teams, "Select a team", (team) => team.teamName, (team) => team.teamName);
}

function getTeamStats(team) {
    const stats = { played: 0, wins: 0, draws: 0, losses: 0 };
    appData.results.forEach((result) => {
        const isFirst = String(result.team1Id || "") === String(team._id) || result.team1 === team.teamName;
        const isSecond = String(result.team2Id || "") === String(team._id) || result.team2 === team.teamName;
        if (!isFirst && !isSecond) return;
        stats.played += 1;
        if (result.winner === "Draw") stats.draws += 1;
        else if ((isFirst && result.winner === result.team1) || (isSecond && result.winner === result.team2)) stats.wins += 1;
        else stats.losses += 1;
    });
    return stats;
}

function renderTeams() {
    const table = document.getElementById("teamTable");
    if (!table) return;

    const search = (document.getElementById("teamSearch")?.value || "").trim().toLowerCase();
    const sportFilter = document.getElementById("teamSportFilter")?.value || "";
    const sports = [...new Set(appData.teams.map((team) => team.sport).filter(Boolean))].sort();
    const sportSelect = document.getElementById("teamSportFilter");
    if (sportSelect) {
        const selected = sportSelect.value;
        populateSelect(sportSelect, sports, "All sports", (sport) => sport, (sport) => sport);
        sportSelect.value = selected;
    }

    const filteredTeams = appData.teams.filter((team) =>
        team.teamName.toLowerCase().includes(search) && (!sportFilter || team.sport === sportFilter));
    clearTable(table);
    filteredTeams.forEach((team) => {
        const stats = getTeamStats(team);
        appendRow(table, [team.teamName, team.sport, team.captain, stats.played, `${stats.wins}-${stats.draws}-${stats.losses}`]);
    });
    setEmptyState("teamEmpty", filteredTeams.length === 0, appData.teams.length ? "No teams match these filters." : "No teams have been added yet.");
}

async function loadTeams() {
    appData.teams = await requestJson("/api/teams");
    ["team1", "team2", "resultTeam1", "resultTeam2"].forEach((id) => populateTeamDropdown(document.getElementById(id), appData.teams));
    renderTeams();
    if (document.getElementById("tournamentTeamPicker")) renderTournamentTeamPicker();
    return appData.teams;
}

function tournamentNameFor(id) {
    const tournament = appData.tournaments.find((item) => String(item._id) === String(id));
    return tournament ? tournament.tournamentName : "General fixtures";
}

function renderFixtureScheduleEditor(fixture) {
    const details = document.createElement("details");
    details.className = "schedule-details";
    const summary = document.createElement("summary");
    summary.textContent = "Edit schedule";
    const form = document.createElement("form");
    form.className = "schedule-editor";
    [
        ["date", "date", fixture.matchDate || fixture.date || ""],
        ["time", "time", fixture.matchTime || fixture.time || ""],
        ["venue", "text", fixture.venue || ""]
    ].forEach(([name, type, value]) => {
        const input = document.createElement("input");
        input.name = name === "date" ? "matchDate" : name === "time" ? "matchTime" : "venue";
        input.type = type;
        input.value = value;
        input.required = true;
        if (name === "venue") input.placeholder = "Venue";
        form.append(input);
    });
    const button = document.createElement("button");
    button.className = "small-btn";
    button.type = "submit";
    button.textContent = "Save";
    form.append(button);
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        await updateFixtureSchedule(fixture._id, Object.fromEntries(new FormData(form).entries()));
    });
    details.append(summary, form);
    return details;
}

function renderFixtures() {
    const table = document.getElementById("fixtureTable");
    if (!table) return;

    const tournamentFilter = document.getElementById("fixtureTournamentFilter")?.value || "";
    const statusFilter = document.getElementById("fixtureStatusFilter")?.value || "";
    const filtered = appData.fixtures.filter((fixture) =>
        (!tournamentFilter || String(fixture.tournamentId || "") === tournamentFilter) &&
        (!statusFilter || (fixture.status || "Scheduled") === statusFilter));
    clearTable(table);
    filtered.forEach((fixture, index) => {
        const row = appendRow(table, [
            fixture.round ? `${fixture.round} ${fixture.bracketSlot === undefined ? "" : fixture.bracketSlot + 1}`.trim() : `Match ${index + 1}`,
            fixture.team1,
            fixture.team2,
            fixture.matchDate || fixture.date,
            fixture.matchTime || fixture.time,
            fixture.venue,
            tournamentNameFor(fixture.tournamentId),
            fixture.round || "Manual",
            fixture.status || "Scheduled"
        ]);
        const actionCell = row.insertCell();
        if (fixture.status !== "Completed" && fixture.team2 !== "BYE") actionCell.append(renderFixtureScheduleEditor(fixture));
    });
    setEmptyState("fixtureEmpty", filtered.length === 0, appData.fixtures.length ? "No fixtures match these filters." : "No fixtures available.");
}

function updateFixtureDropdown() {
    const select = document.getElementById("resultFixture");
    if (!select) return;
    const scheduled = appData.fixtures.filter((fixture) => fixture.status !== "Completed" && fixture.team2 !== "BYE");
    populateSelect(select, scheduled, "Manual result", (fixture) => fixture._id,
        (fixture) => `${fixture.team1} vs ${fixture.team2}${fixture.round ? ` - ${fixture.round}` : ""}`);
}

function renderResults() {
    const table = document.getElementById("resultTable");
    if (!table) return;
    const tournamentFilter = document.getElementById("resultTournamentFilter")?.value || "";
    const filtered = appData.results.filter((result) => !tournamentFilter || String(result.tournamentId || "") === tournamentFilter);
    clearTable(table);
    filtered.forEach((result) => {
        const row = appendRow(table, [result.team1, result.score1, result.team2, result.score2, result.winner, tournamentNameFor(result.tournamentId)]);
        if (row && row.cells[4]) row.cells[4].classList.add("winner-cell");
    });
    setEmptyState("resultEmpty", filtered.length === 0, appData.results.length ? "No results match this tournament filter." : "No results recorded yet.");
}

async function loadFixtures() {
    appData.fixtures = await requestJson("/api/fixtures");
    updateFixtureDropdown();
    renderFixtures();
    return appData.fixtures;
}

async function loadResults() {
    appData.results = await requestJson("/api/results");
    renderResults();
    renderTeams();
    return appData.results;
}

function createMatchItem(fixture) {
    const item = document.createElement("article");
    item.className = "match-item";
    const details = document.createElement("div");
    const teams = document.createElement("p");
    teams.className = "match-teams";
    teams.textContent = `${fixture.team1} vs ${fixture.team2}`;
    const meta = document.createElement("p");
    meta.className = "match-meta";
    meta.textContent = `${fixture.venue || "Venue pending"} | ${fixture.matchTime || fixture.time || "Time pending"}`;
    const date = document.createElement("time");
    date.className = "match-date";
    const rawDate = fixture.matchDate || fixture.date;
    const parsedDate = new Date(`${rawDate}T00:00:00`);
    date.textContent = Number.isNaN(parsedDate.getTime()) ? "Date pending" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(parsedDate);
    details.append(teams, meta);
    item.append(details, date);
    return item;
}

function renderDashboardFixtures(fixtures) {
    const list = document.getElementById("dashboardFixtures");
    if (!list) return;
    list.replaceChildren();
    fixtures.slice(0, 5).forEach((fixture) => list.append(createMatchItem(fixture)));
    list.hidden = fixtures.length === 0;
    setEmptyState("dashboardFixturesEmpty", fixtures.length === 0, "No fixtures available.");
}

function renderDashboardResults(results) {
    const list = document.getElementById("dashboardResults");
    if (!list) return;
    list.replaceChildren();
    results.slice(0, 5).forEach((result) => {
        const item = document.createElement("article");
        item.className = "match-item";
        const details = document.createElement("div");
        const teams = document.createElement("p");
        teams.className = "match-teams";
        teams.textContent = `${result.team1} ${result.score1} - ${result.score2} ${result.team2}`;
        const tournament = document.createElement("p");
        tournament.className = "match-meta";
        tournament.textContent = tournamentNameFor(result.tournamentId);
        const winner = document.createElement("span");
        winner.className = "winner-tag";
        winner.textContent = result.winner === "Draw" ? "Draw" : `Winner: ${result.winner}`;
        details.append(teams, tournament);
        item.append(details, winner);
        list.append(item);
    });
    list.hidden = results.length === 0;
    setEmptyState("dashboardResultsEmpty", results.length === 0, "No results available.");
}

function renderProgressItem(tournament) {
    const item = document.createElement("article");
    item.className = "progress-item";
    const top = document.createElement("div");
    top.className = "progress-item-top";
    const title = document.createElement("h3");
    title.textContent = tournament.tournamentName;
    const status = document.createElement("span");
    status.className = `status-badge status-badge--${tournament.status.toLowerCase()}`;
    status.textContent = tournament.status;
    top.append(title, status);
    const heading = document.createElement("div");
    heading.className = "progress-heading";
    const counts = tournament.progress || { completedMatches: 0, totalMatches: 0, percentage: 0 };
        const matchCount = document.createElement("span");
        matchCount.textContent = `${counts.completedMatches} / ${counts.totalMatches} matches`;
        const percentage = document.createElement("span");
        percentage.textContent = `${counts.percentage}%`;
        heading.append(matchCount, percentage);
    const track = document.createElement("div");
    track.className = "progress-track";
    const fill = document.createElement("div");
    fill.className = "progress-fill";
    fill.style.width = `${counts.percentage}%`;
    track.append(fill);
    item.append(top, heading, track);
    return item;
}

function renderDashboardProgress(tournaments) {
    const list = document.getElementById("dashboardTournamentProgress");
    if (!list) return;
    const active = tournaments.filter((tournament) => tournament.status === "Ongoing");
    list.replaceChildren(...active.slice(0, 4).map(renderProgressItem));
    setEmptyState("dashboardTournamentEmpty", active.length === 0, "No active tournament yet.");
}

function renderDashboardLeader(tournaments, leaders = []) {
    const container = document.getElementById("dashboardLeader");
    if (!container) return;
    container.replaceChildren();
    const champion = tournaments.find((tournament) => tournament.status === "Completed" && tournament.champion);
    if (champion) {
        const label = document.createElement("p");
        label.className = "eyebrow";
        label.textContent = "LATEST CHAMPION";
        const name = document.createElement("p");
        name.className = "leader-name";
        name.textContent = champion.champion;
        const meta = document.createElement("p");
        meta.className = "leader-meta";
        meta.textContent = champion.tournamentName;
        container.append(label, name, meta);
        return;
    }
    const leader = leaders.find((entry) => entry.standings.length);
    if (leader) {
        const label = document.createElement("p");
        label.className = "eyebrow";
        label.textContent = "CURRENT LEAGUE LEADER";
        const name = document.createElement("p");
        name.className = "leader-name";
        name.textContent = leader.standings[0].teamName;
        const meta = document.createElement("p");
        meta.className = "leader-meta";
        meta.textContent = `${leader.tournament.tournamentName} | ${leader.standings[0].points} points`;
        container.append(label, name, meta);
        return;
    }
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No completed tournament yet.";
    container.append(empty);
}

async function loadDashboard() {
    try {
        const [teams, fixtures, results, tournaments] = await Promise.all([
            requestJson("/api/teams"),
            requestJson("/api/fixtures"),
            requestJson("/api/results"),
            requestJson("/api/tournaments")
        ]);
        appData.teams = teams;
        appData.fixtures = fixtures;
        appData.results = results;
        appData.tournaments = tournaments;
        const active = tournaments.filter((tournament) => tournament.status === "Ongoing");
        document.getElementById("tournamentCount").textContent = String(tournaments.length);
        document.getElementById("activeTournamentCount").textContent = String(active.length);
        document.getElementById("teamCount").textContent = String(teams.length);
        document.getElementById("fixtureCount").textContent = String(fixtures.length);
        document.getElementById("resultCount").textContent = String(results.length);

        const now = new Date();
        const upcoming = fixtures.filter((fixture) => {
            if (fixture.status === "Completed" || fixture.team2 === "BYE") return false;
            const date = fixture.matchDate || fixture.date;
            const start = new Date(`${date}T${fixture.matchTime || fixture.time || "00:00"}`);
            return !Number.isNaN(start.getTime()) && start >= now;
        }).sort((first, second) => new Date(`${first.matchDate || first.date}T${first.matchTime || first.time || "00:00"}`) - new Date(`${second.matchDate || second.date}T${second.matchTime || second.time || "00:00"}`));
        renderDashboardFixtures(upcoming);
        renderDashboardResults(results.slice().sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0)));
        renderDashboardProgress(tournaments);

        const leaderRows = await Promise.all(active.filter((tournament) => tournament.format === "League")
            .map(async (tournament) => ({ tournament, standings: await requestJson(`/api/tournaments/${tournament._id}/standings`) })));
        renderDashboardLeader(tournaments, leaderRows);
        document.getElementById("dashboardStatus").hidden = true;
    } catch (error) {
        console.error(error);
        const status = document.getElementById("dashboardStatus");
        status.textContent = error.message;
        status.hidden = false;
        renderDashboardFixtures([]);
        renderDashboardResults([]);
    }
}

function renderTournamentCards() {
    const container = document.getElementById("tournamentList");
    if (!container) return;
    const search = (document.getElementById("tournamentSearch")?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("tournamentStatusFilter")?.value || "";
    const tournaments = appData.tournaments.filter((tournament) =>
        tournament.tournamentName.toLowerCase().includes(search) && (!statusFilter || tournament.status === statusFilter));
    container.replaceChildren();

    tournaments.forEach((tournament) => {
        const card = document.createElement("article");
        card.className = "tournament-card";
        const top = document.createElement("div");
        top.className = "tournament-card-top";
        const details = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = tournament.tournamentName;
        const meta = document.createElement("p");
        meta.className = "tournament-card-meta";
        meta.textContent = `${tournament.sport} | ${tournament.format} | ${tournament.teams.length}/${tournament.numberOfTeams} teams`;
        const dates = document.createElement("p");
        dates.className = "tournament-card-meta";
        dates.textContent = `${tournament.startDate} to ${tournament.endDate} | ${tournament.venue}`;
        details.append(title, meta, dates);
        const badge = document.createElement("span");
        badge.className = `status-badge status-badge--${tournament.status.toLowerCase()}`;
        badge.textContent = tournament.status;
        top.append(details, badge);
        const progress = renderProgressItem(tournament);
        progress.classList.add("tournament-card-progress");
        const actions = document.createElement("div");
        actions.className = "tournament-card-actions";
        const manage = document.createElement("button");
        manage.className = "small-btn";
        manage.type = "button";
        manage.textContent = "Manage";
        manage.addEventListener("click", () => selectTournament(tournament._id));
        const standings = document.createElement("a");
        standings.className = "small-btn";
        standings.href = `standings.html?tournament=${encodeURIComponent(tournament._id)}`;
        standings.textContent = tournament.format === "League" ? "Standings" : "Bracket";
        const remove = document.createElement("button");
        remove.className = "small-btn small-btn--danger";
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => deleteTournament(tournament));
        actions.append(manage, standings, remove);
        card.append(top, progress, actions);
        container.append(card);
    });
    setEmptyState("tournamentEmpty", tournaments.length === 0, appData.tournaments.length ? "No tournaments match this filter." : "No tournaments created yet.");
}

function renderTournamentTeamPicker() {
    const picker = document.getElementById("tournamentTeamPicker");
    const tournament = activeTournament?.tournament;
    if (!picker) return;
    picker.replaceChildren();
    if (!tournament) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Create or select a tournament to assign teams.";
        picker.append(empty);
        updateSelectedTeamCount();
        return;
    }

    if (!appData.teams.length) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Add teams before assigning participants.";
        picker.append(empty);
        return;
    }
    const selectedIds = new Set((tournament.teams || []).map((team) => String(team._id || team)));
    appData.teams.forEach((team) => {
        const label = document.createElement("label");
        label.className = "team-choice";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = team._id;
        checkbox.checked = selectedIds.has(String(team._id));
        checkbox.disabled = tournament.status !== "Upcoming";
        checkbox.addEventListener("change", () => {
            const selected = picker.querySelectorAll("input:checked");
            if (selected.length > tournament.numberOfTeams) {
                checkbox.checked = false;
                setMessage("tournamentMessage", `Select no more than ${tournament.numberOfTeams} teams.`, true);
            } else {
                setMessage("tournamentMessage", "");
            }
            updateSelectedTeamCount();
        });
        label.append(checkbox, document.createTextNode(`${team.teamName} - ${team.sport}`));
        picker.append(label);
    });
    updateSelectedTeamCount();
}

function updateSelectedTeamCount() {
    const picker = document.getElementById("tournamentTeamPicker");
    const tournament = activeTournament?.tournament;
    if (!picker || !tournament) return;
    const count = picker.querySelectorAll("input:checked").length;
    document.getElementById("selectedTeamCount").textContent = `${count} / ${tournament.numberOfTeams} selected`;
    const editable = tournament.status === "Upcoming";
    document.getElementById("saveTournamentTeams").disabled = !editable;
    document.getElementById("startTournament").disabled = !editable || count !== tournament.numberOfTeams;
    document.getElementById("generateTournamentFixtures").disabled = tournament.status !== "Ongoing" || activeTournament.fixtures.length > 0;

    const progress = document.getElementById("tournamentProgressDisplay");
    progress.hidden = tournament.status === "Upcoming";
    if (!progress.hidden) {
        const current = activeTournament.progress;
        progress.replaceChildren();
        const heading = document.createElement("div");
        heading.className = "progress-heading";
        heading.textContent = `Matches Completed: ${current.completedMatches} / ${current.totalMatches} matches - ${current.percentage}%`;
        const track = document.createElement("div");
        track.className = "progress-track";
        const fill = document.createElement("div");
        fill.className = "progress-fill";
        fill.style.width = `${current.percentage}%`;
        track.append(fill);
        progress.append(heading, track);
    }
    const champion = document.getElementById("tournamentChampion");
    champion.hidden = !tournament.champion;
    champion.replaceChildren();
    if (tournament.champion) {
        const label = document.createElement("p");
        label.textContent = "Tournament Champion";
        const name = document.createElement("strong");
        name.textContent = tournament.champion;
        champion.append(label, name);
    }
}

async function loadTournaments() {
    appData.tournaments = await requestJson("/api/tournaments");
    renderTournamentCards();
    ["manageTournament", "standingsTournament", "fixtureTournamentFilter", "resultTournamentFilter"].forEach((id) => {
        populateSelect(document.getElementById(id), appData.tournaments, id === "manageTournament" || id === "standingsTournament" ? "Select a tournament" : "All tournaments", (tournament) => tournament._id, (tournament) => tournament.tournamentName);
    });
    if (document.getElementById("fixtureTable")) renderFixtures();
    if (document.getElementById("resultTable")) renderResults();
    return appData.tournaments;
}

async function selectTournament(id) {
    const select = document.getElementById("manageTournament");
    if (select) select.value = id;
    await loadTournamentSetup(id);
    document.getElementById("setup-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function loadTournamentSetup(id) {
    if (!id) {
        activeTournament = null;
        renderTournamentTeamPicker();
        document.getElementById("tournamentProgressDisplay").hidden = true;
        document.getElementById("tournamentChampion").hidden = true;
        ["saveTournamentTeams", "startTournament", "generateTournamentFixtures"].forEach((buttonId) => {
            document.getElementById(buttonId).disabled = true;
        });
        return;
    }
    activeTournament = await requestJson(`/api/tournaments/${id}`);
    renderTournamentTeamPicker();
    setMessage("tournamentMessage", "");
}

async function addTournament() {
    const payload = {
        tournamentName: document.getElementById("tournamentName").value.trim(),
        sport: document.getElementById("tournamentSport").value,
        startDate: document.getElementById("startDate").value,
        endDate: document.getElementById("endDate").value,
        venue: document.getElementById("tournamentVenue").value.trim(),
        numberOfTeams: Number(document.getElementById("numberOfTeams").value),
        format: document.getElementById("tournamentFormat").value
    };
    if (!payload.tournamentName || !payload.venue || !payload.startDate || !payload.endDate || payload.endDate < payload.startDate || payload.numberOfTeams < 2) {
        setMessage("tournamentMessage", "Enter a name, venue, valid date range, and at least two teams.", true);
        return;
    }
    try {
        const data = await requestJson("/api/tournaments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        document.getElementById("tournamentName").value = "";
        document.getElementById("tournamentVenue").value = "";
        await loadTournaments();
        await selectTournament(data.tournament._id);
        setMessage("tournamentMessage", "Tournament created. Select its teams to continue.");
    } catch (error) {
        setMessage("tournamentMessage", error.message, true);
    }
}

async function saveTournamentTeams() {
    if (!activeTournament) return;
    const teamIds = [...document.querySelectorAll("#tournamentTeamPicker input:checked")].map((checkbox) => checkbox.value);
    try {
        await requestJson(`/api/tournaments/${activeTournament.tournament._id}/teams`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamIds })
        });
        await loadTournaments();
        await loadTournamentSetup(activeTournament.tournament._id);
        setMessage("tournamentMessage", `Saved ${teamIds.length} team${teamIds.length === 1 ? "" : "s"}.`);
    } catch (error) {
        setMessage("tournamentMessage", error.message, true);
    }
}

async function startTournament() {
    if (!activeTournament) return;
    try {
        await requestJson(`/api/tournaments/${activeTournament.tournament._id}/start`, { method: "POST" });
        await refreshActiveTournament("Tournament started. Generate its fixtures when ready.");
    } catch (error) {
        setMessage("tournamentMessage", error.message, true);
    }
}

async function generateTournamentFixtures() {
    if (!activeTournament) return;
    try {
        const data = await requestJson(`/api/tournaments/${activeTournament.tournament._id}/generate-fixtures`, { method: "POST" });
        await refreshActiveTournament(`${data.fixtures.filter((fixture) => fixture.team2 !== "BYE").length} first-round matches generated.`);
        await loadFixtures();
    } catch (error) {
        setMessage("tournamentMessage", error.message, true);
    }
}

async function refreshActiveTournament(message) {
    const id = activeTournament?.tournament._id;
    await loadTournaments();
    await loadTournamentSetup(id);
    setMessage("tournamentMessage", message);
}

async function deleteTournament(tournament) {
    if (!confirm(`Delete "${tournament.tournamentName}" and its tournament fixtures/results? Existing teams will not be deleted.`)) return;
    try {
        await requestJson(`/api/tournaments/${tournament._id}`, { method: "DELETE" });
        if (activeTournament && String(activeTournament.tournament._id) === String(tournament._id)) await loadTournamentSetup("");
        await loadTournaments();
    } catch (error) {
        showError(error);
    }
}

async function updateFixtureSchedule(id, payload) {
    try {
        await requestJson(`/api/fixtures/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        await loadFixtures();
    } catch (error) {
        showError(error);
    }
}

async function addTeam() {
    const teamName = document.getElementById("teamName").value.trim();
    const sport = document.getElementById("sport").value;
    const captain = document.getElementById("captain").value.trim();
    if (!teamName || !captain) {
        alert("Please enter a team name and captain name.");
        return;
    }
    try {
        await requestJson("/api/teams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamName, sport, captain })
        });
        document.getElementById("teamName").value = "";
        document.getElementById("captain").value = "";
        await loadTeams();
        alert("Team added successfully.");
    } catch (error) {
        showError(error);
    }
}

async function addFixture() {
    const fixture = {
        team1: document.getElementById("team1").value,
        team2: document.getElementById("team2").value,
        matchDate: document.getElementById("matchDate").value,
        matchTime: document.getElementById("matchTime").value,
        venue: document.getElementById("venue").value.trim()
    };
    if (!fixture.team1 || !fixture.team2 || fixture.team1 === fixture.team2) {
        alert("Please select two different teams.");
        return;
    }
    if (!fixture.matchDate || !fixture.matchTime || !fixture.venue) {
        alert("Please enter a date, time, and venue.");
        return;
    }
    try {
        await requestJson("/api/fixtures", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fixture)
        });
        document.getElementById("venue").value = "";
        await loadFixtures();
        alert("Fixture created successfully.");
    } catch (error) {
        showError(error);
    }
}

function handleResultFixtureChange() {
    const fixtureId = document.getElementById("resultFixture")?.value;
    const fixture = appData.fixtures.find((item) => String(item._id) === fixtureId);
    const team1 = document.getElementById("resultTeam1");
    const team2 = document.getElementById("resultTeam2");
    if (fixture) {
        team1.value = fixture.team1;
        team2.value = fixture.team2;
        team1.disabled = true;
        team2.disabled = true;
    } else {
        team1.disabled = false;
        team2.disabled = false;
        team1.value = "";
        team2.value = "";
    }
}

async function addResult() {
    const fixtureId = document.getElementById("resultFixture")?.value || "";
    const team1 = document.getElementById("resultTeam1").value;
    const team2 = document.getElementById("resultTeam2").value;
    const score1Value = document.getElementById("score1").value;
    const score2Value = document.getElementById("score2").value;
    if (!team1 || !team2 || team1 === team2) {
        alert("Please select two different teams or a scheduled fixture.");
        return;
    }
    if (score1Value === "" || score2Value === "") {
        alert("Please enter both scores.");
        return;
    }
    const score1 = Number(score1Value);
    const score2 = Number(score2Value);
    if (!Number.isFinite(score1) || !Number.isFinite(score2) || score1 < 0 || score2 < 0) {
        alert("Scores must be valid non-negative numbers.");
        return;
    }
    try {
        await requestJson("/api/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fixtureId: fixtureId || undefined, team1, team2, score1, score2 })
        });
        document.getElementById("score1").value = "";
        document.getElementById("score2").value = "";
        if (document.getElementById("resultFixture")) document.getElementById("resultFixture").value = "";
        handleResultFixtureChange();
        await Promise.all([loadResults(), loadFixtures(), loadTournaments()]);
        alert("Result saved successfully.");
    } catch (error) {
        showError(error);
    }
}

function renderStandings(standings) {
    const table = document.getElementById("standingsTable");
    clearTable(table);
    standings.forEach((entry) => {
        const row = appendRow(table, [
            entry.position,
            entry.teamName,
            entry.played,
            entry.won,
            entry.drawn,
            entry.lost,
            entry.scoreFor,
            entry.scoreAgainst,
            entry.scoreDifference,
            entry.points
        ]);
        if (entry.position === 1) {
            row.classList.add("leader-row");
            const marker = document.createElement("span");
            marker.className = "leader-trophy";
            marker.textContent = "🏆";
            marker.setAttribute("aria-label", "League leader");
            row.cells[0].prepend(marker);
        }
    });
    setEmptyState("standingsEmpty", standings.length === 0, "Standings will appear after results are recorded.");
}

function renderBracket(fixtures) {
    const bracket = document.getElementById("knockoutBracket");
    bracket.replaceChildren();
    const rounds = new Map();
    fixtures.filter((fixture) => fixture.team2 !== "BYE").forEach((fixture) => {
        if (!rounds.has(fixture.round)) rounds.set(fixture.round, []);
        rounds.get(fixture.round).push(fixture);
    });
    rounds.forEach((matches, round) => {
        const column = document.createElement("section");
        column.className = "bracket-round";
        const heading = document.createElement("h3");
        heading.textContent = round;
        column.append(heading);
        matches.forEach((fixture) => {
            const match = document.createElement("article");
            match.className = "bracket-match";
            [fixture.team1, fixture.team2].forEach((team) => {
                const line = document.createElement("p");
                line.textContent = team;
                if (fixture.winner === team) line.className = "bracket-winner";
                match.append(line);
            });
            const status = document.createElement("p");
            status.className = "match-meta";
            status.textContent = fixture.status;
            match.append(status);
            column.append(match);
        });
        bracket.append(column);
    });
}

async function loadStandingsView() {
    const id = document.getElementById("standingsTournament")?.value || new URLSearchParams(location.search).get("tournament");
    if (!id) return;
    const select = document.getElementById("standingsTournament");
    if (select) select.value = id;
    const detail = await requestJson(`/api/tournaments/${id}`);
    const { tournament, progress, fixtures } = detail;
    const summary = document.getElementById("standingsSummary");
    summary.replaceChildren();
    summary.hidden = false;
    const values = [
        ["Status", tournament.status],
        ["Progress", `${progress.completedMatches}/${progress.totalMatches} (${progress.percentage}%)`],
        ["Teams", `${tournament.teams.length}/${tournament.numberOfTeams}`]
    ];
    if (tournament.champion) values.push(["Champion", tournament.champion]);
    values.forEach(([label, value]) => {
        const item = document.createElement("span");
        const strong = document.createElement("strong");
        strong.textContent = `${label}: `;
        item.append(strong, value);
        summary.append(item);
    });

    const league = tournament.format === "League";
    document.getElementById("leagueStandings").hidden = !league;
    document.getElementById("knockoutBracket").hidden = league;
    const champion = document.getElementById("standingsChampion");
    champion.hidden = !tournament.champion;
    champion.replaceChildren();
    if (tournament.champion) {
        const label = document.createElement("p");
        label.textContent = "🏆 Champion";
        const name = document.createElement("strong");
        name.textContent = tournament.champion;
        champion.append(label, name);
    }
    if (league) renderStandings(await requestJson(`/api/tournaments/${id}/standings`));
    else renderBracket(fixtures);
}

function initializePage() {
    const isDashboard = Boolean(document.getElementById("tournamentCount"));
    const hasTeams = Boolean(document.getElementById("teamTable"));
    const hasFixtures = Boolean(document.getElementById("fixtureTable"));
    const hasResults = Boolean(document.getElementById("resultTable"));
    const hasTournaments = Boolean(document.getElementById("tournamentList"));
    const hasStandings = Boolean(document.getElementById("standingsTournament"));

    if (isDashboard) loadDashboard();
    if (hasTeams) Promise.all([loadTeams(), loadResults()]).catch(showError);
    if (hasFixtures) Promise.all([loadTeams(), loadFixtures(), loadTournaments()]).catch(showError);
    if (hasResults) Promise.all([loadTeams(), loadFixtures(), loadResults(), loadTournaments()]).catch(showError);
    if (hasTournaments) Promise.all([loadTeams(), loadTournaments()]).catch(showError);
    if (hasStandings) {
        loadTournaments().then(() => {
            const requested = new URLSearchParams(location.search).get("tournament");
            if (requested) loadStandingsView().catch(showError);
        }).catch(showError);
    }

    document.getElementById("teamSearch")?.addEventListener("input", renderTeams);
    document.getElementById("teamSportFilter")?.addEventListener("change", renderTeams);
    document.getElementById("fixtureTournamentFilter")?.addEventListener("change", renderFixtures);
    document.getElementById("fixtureStatusFilter")?.addEventListener("change", renderFixtures);
    document.getElementById("resultTournamentFilter")?.addEventListener("change", renderResults);
    document.getElementById("resultFixture")?.addEventListener("change", handleResultFixtureChange);
    document.getElementById("tournamentSearch")?.addEventListener("input", renderTournamentCards);
    document.getElementById("tournamentStatusFilter")?.addEventListener("change", renderTournamentCards);
    document.getElementById("manageTournament")?.addEventListener("change", (event) => loadTournamentSetup(event.target.value).catch((error) => setMessage("tournamentMessage", error.message, true)));
    document.getElementById("saveTournamentTeams")?.addEventListener("click", saveTournamentTeams);
    document.getElementById("startTournament")?.addEventListener("click", startTournament);
    document.getElementById("generateTournamentFixtures")?.addEventListener("click", generateTournamentFixtures);
    document.getElementById("standingsTournament")?.addEventListener("change", () => loadStandingsView().catch(showError));
}

document.addEventListener("DOMContentLoaded", initializePage);