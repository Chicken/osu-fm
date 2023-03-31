import { readFile } from "fs/promises";
import Realm from "realm";
import { postSong, startup } from "./lastfm.js";

// TODO: find this automatically
const osuDirectory = "/home/antti/.local/share/osu";

const realm = await Realm.open({
    path: `${osuDirectory}/client.realm`,
    disableFormatUpgrade: true,
    schemaVersion: 26,
});

const currentUsername = (await readFile(`${osuDirectory}/game.ini`, "utf8"))
    .split("\n")
    .find((l) => l.trim().startsWith("Username"))
    ?.split(" = ")[1]
    .trim();

console.log(`Watching for scores by ${currentUsername}...`);

process.on("SIGINT", () => process.exit());
process.on("SIGTERM", () => process.exit());
process.on("exit", () => {
    realm.close();
});

/**
 * @typedef {Object} Score
 * @property {BeatmapInfo} BeatmapInfo
 * @property {User} User
 * @property {Date} Date
 */

/**
 * @typedef {Object} BeatmapInfo
 * @property {BeatmapMetadata} Metadata
 * @property {number} Length
 */

/**
 * @typedef {Object} BeatmapMetadata
 * @property {string} Title
 * @property {string} Artist
 */

/**
 * @typedef {Object} User
 * @property {string} Username
 */

const scores = realm.objects("Score");

scores.addListener((scores, changes) => {
    changes.insertions.forEach((scoreIndex) => {
        const score = /** @type {Score} */ (scores[scoreIndex].toJSON());
        if (
            score.User.Username === currentUsername &&
            Date.now() - score.Date.getTime() < 30 * 1000
        )
            newScore(score);
    });
});

// Startup authentication
await startup();

/**
 * @param {Score} score
 */
function newScore(score) {
    const songTitle = score.BeatmapInfo.Metadata.Title;
    const songArtist = score.BeatmapInfo.Metadata.Artist;
    const length = ~~(score.BeatmapInfo.Length / 1000);

    console.log("Played:", songArtist, "-", songTitle);

    postSong(songTitle, songArtist, length).catch(console.error);
}

// TODO: make UI for this
