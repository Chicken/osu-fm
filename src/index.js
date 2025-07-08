import { readFile } from "node:fs/promises";
import Realm from "realm";
import { postSong, startup } from "./lastfm.js";
import path from "node:path";
import { app, Tray, Menu } from "electron";

const orError = () => {
    throw new Error("Environment is broke ngl");
};
const osuDirectory =
    process.platform === "linux"
        ? path.join(process.env.HOME || orError(), ".local/share/osu")
        : path.join(process.env.APPDATA || orError(), "osu");

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

(async () => {
    const realm = await Realm.open({
        path: path.join(osuDirectory, "client.realm"),
        disableFormatUpgrade: true,
        schemaVersion: 26,
    });

    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
    process.on("exit", () => {
        realm.close();
    });

    const currentUsername = (await readFile(path.join(osuDirectory, "game.ini"), "utf8"))
        .split("\n")
        .find((l) => l.trim().startsWith("Username"))
        ?.split(" = ")[1]
        .trim();

    if (!currentUsername) throw new Error("Couldn't find current username");

    console.log(`Watching for scores by ${currentUsername}...`);

    const scores = realm.objects("Score");

    scores.addListener((scores, changes) => {
        changes.insertions.forEach((scoreIndex) => {
            const score = /** @type {Score} */ (scores[scoreIndex].toJSON());
            if (score.User.Username === currentUsername && Date.now() - score.Date.getTime() < 30 * 1000)
                newScore(score);
        });
    });

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

    function startApp() {
        const lockedInstance = app.requestSingleInstanceLock();
        if (!lockedInstance) return app.quit();

        const tray = new Tray(path.join(import.meta.dirname, "..", "icons", "tray.png"));
        tray.setToolTip("osu!fm - Last.fm scrobbler for osu!");
        tray.setContextMenu(
            Menu.buildFromTemplate([
                {
                    label: "Quit",
                    role: "quit",
                },
            ])
        );
    }

    if (app.isReady()) {
        startApp();
    } else {
        app.once("ready", startApp);
    }

    startup();
})();
