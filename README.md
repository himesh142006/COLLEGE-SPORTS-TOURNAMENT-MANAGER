# 🏆 College Sports Tournament Manager

A full-stack web application for managing college sports tournaments, teams, fixtures, match results, standings, and champions.

## 📌 About the Project

The College Sports Tournament Manager is designed to simplify the management of college sports tournaments.

Administrators can create tournaments, add teams, generate fixtures, enter match results, view standings, monitor tournament progress, and determine the champion.

The application supports both **League** and **Knockout** tournament formats.

## ✨ Features

- Create and manage tournaments
- Add and manage teams
- Assign teams to tournaments
- League and Knockout tournament formats
- Automatic fixture generation
- Fixture rescheduling
- Enter and manage match results
- Automatic winner calculation
- League points table and standings
- Tournament progress tracking
- Automatic champion calculation
- Duplicate fixture and result prevention
- Responsive dashboard
- MongoDB database integration

## 🛠️ Technologies Used

### Frontend
- HTML5
- CSS3
- JavaScript

### Backend
- Node.js
- Express.js

### Database
- MongoDB Atlas
- Mongoose

## 📂 Project Structure

    college_Sports_Tournament_Manager/
    │
    ├── index.html
    ├── tournaments.html
    ├── teams.html
    ├── fixtures.html
    ├── results.html
    ├── standings.html
    │
    ├── style.css
    ├── script.js
    │
    ├── server.js
    ├── Team.js
    ├── Tournament.js
    ├── Fixture.js
    ├── Result.js
    ├── Standing.js
    │
    ├── package.json
    ├── package-lock.json
    └── .gitignore

## ⚙️ Installation

1. Clone the repository:

    git clone https://github.com/himesh142006/COLLEGE-SPORTS-TOURNAMENT-MANAGER.git

2. Open the project folder:

    cd COLLEGE-SPORTS-TOURNAMENT-MANAGER

3. Install the required packages:

    npm install

4. Create a `.env` file and add your MongoDB connection string:

    MONGO_URI=your_mongodb_connection_string
    PORT=3000

5. Start the server:

    node server.js

6. Open the application in your browser:

    http://localhost:3000

## 🔄 How the System Works

The application follows this architecture:

    Browser
       ↓
    HTML / CSS / JavaScript
       ↓
    Fetch API
       ↓
    Node.js + Express.js
       ↓
    Mongoose
       ↓
    MongoDB Atlas

The frontend communicates with the Express backend using API requests. The backend processes the requests and uses Mongoose to store and retrieve data from MongoDB Atlas.

## 🏏 Tournament Workflow

    Create Tournament
          ↓
    Add / Assign Teams
          ↓
    Start Tournament
          ↓
    Generate Fixtures
          ↓
    Enter Match Results
          ↓
    Update Standings
          ↓
    Track Progress
          ↓
    Declare Champion

## 🥇 League Points System

- Win: 3 Points
- Draw: 1 Point
- Loss: 0 Points

The standings include matches played, wins, draws, losses, points, scores, score difference, and position.

## 🏆 Tournament Formats

### League

Every team plays against the other teams. The number of fixtures for `n` teams is:

    n × (n - 1) / 2

Teams are ranked according to their performance and points.

### Knockout

Teams progress through knockout rounds based on match results until the final match determines the champion.

## 🔐 Security

Sensitive information such as the MongoDB connection string is stored inside the `.env` file.

The following files/folders are excluded from GitHub using `.gitignore`:

    .env
    node_modules/

Never upload database passwords or other credentials to GitHub.

## 👨‍💻 Developer

**Himesh**

B.Tech Student

## 🔗 Repository

GitHub Repository:

https://github.com/himesh142006/COLLEGE-SPORTS-TOURNAMENT-MANAGER
