/*
Original from <https://github.com/th-ch/youtube-music/blob/f722cf86ddcc20237ed286965068b2de9052ec3b/plugins/last-fm/back.js>

The MIT License (MIT)

Copyright (c) th-ch <th-ch@users.noreply.github.com> (https://github.com/th-ch/youtube-music)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

import md5 from "md5";
import fetch from "node-fetch";

/**
 * @param {Record<string, string>} params
 * @returns {URLSearchParams}
 */
function createFormData(params) {
    // creates the body for in the post request
    const formData = new URLSearchParams();
    for (const key in params) {
        formData.append(key, params[key]);
    }
    return formData;
}

/**
 * @param {Record<string, string>} params
 * @param {string} api_sig
 * @returns {string}
 */
function createQueryString(params, api_sig) {
    // creates a querystring
    const queryData = [];
    params.api_sig = api_sig;
    for (const key in params) {
        queryData.push(`${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`);
    }
    return "?" + queryData.join("&");
}

/**
 * @param {Record<string, string>} params
 * @param {string} secret
 * @returns {string}
 */
function createApiSig(params, secret) {
    // this function creates the api signature, see: https://www.last.fm/api/authspec
    const keys = [];
    for (const key in params) {
        keys.push(key);
    }
    keys.sort();
    let sig = "";
    for (const key of keys) {
        if (String(key) === "format") continue;
        sig += `${key}${params[key]}`;
    }
    sig += secret;
    sig = md5(sig);
    return sig;
}

/**
 *
 * @param {Config} config
 * @returns {Promise<string | undefined>}
 */
async function createToken({ api_key, api_root, secret }) {
    // creates and stores the auth token
    const data = {
        method: "auth.gettoken",
        api_key: api_key,
        format: "json",
    };
    const api_sig = createApiSig(data, secret);
    const response = await fetch(`${api_root}${createQueryString(data, api_sig)}`);
    const json = /** @type {{ token: string | undefined } | undefined} */ (await response.json());
    return json?.token;
}

/**
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function authenticate(config) {
    // asks the user for authentication
    config.token = await createToken(config);
    // TODO: save config
    console.log(
        `Authentication URL - https://www.last.fm/api/auth/?api_key=${config.api_key}&token=${config.token}`
    );

    await getAndSetSessionKey(config);
}

/**
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function getAndSetSessionKey(config) {
    if (!config.token) throw new Error("No token found");
    // get and store the session key
    const data = {
        api_key: config.api_key,
        format: "json",
        method: "auth.getsession",
        token: config.token ?? "",
    };
    const api_sig = createApiSig(data, config.secret);
    const response = await fetch(`${config.api_root}${createQueryString(data, api_sig)}`);
    const json = /** @type {{ error?: unknown; session?: { key?: string; }; }} */ (
        await response.json()
    );
    if (json.error) {
        setTimeout(() => {
            getAndSetSessionKey(config);
        }, config.retry_timeout);
        return;
    }
    config.session_key = json?.session?.key;
    // TODO: save config
    return;
}

/**
 * @typedef {Object} SongInfo
 * @property {string} title
 * @property {string} artist
 * @property {number} duration
 */

/**
 * @param {SongInfo} songInfo
 * @param {Config} config
 * @returns {Promise<void>}
 */
async function postSongDataToAPI(songInfo, config) {
    // this sends a post request to the api, and adds the common data
    if (!config.session_key) {
        console.error("ERROR: Not authenticated yet!");
        return;
    }

    const postData = {
        track: songInfo.title,
        duration: songInfo.duration.toString(),
        artist: songInfo.artist,
        api_key: config.api_key,
        sk: config.session_key,
        format: "json",
        method: "track.scrobble",
        timestamp: "" + ~~(Date.now() / 1000),
    };

    postData.api_sig = createApiSig(postData, config.secret);
    fetch("https://ws.audioscrobbler.com/2.0/", {
        method: "POST",
        body: createFormData(postData),
    }).catch((res) => {
        if (res.response.data.error == 9) {
            // session key is invalid, so remove it from the config and reauthenticate
            config.session_key = undefined;
            // TODO: save config
            authenticate(config);
        }
    });
}

/**
 * @typedef {Object} Config
 * @property {string} api_key
 * @property {string} api_root
 * @property {string} secret
 * @property {number} retry_timeout
 * @property {string} [token]
 * @property {string} [session_key]
 */

const config = /** @type {Config} */ {
    // these can probably be left in???
    api_key: "f65396fe72179242d48d47b55b9393f7",
    api_root: "https://ws.audioscrobbler.com/2.0/",
    secret: "97d60a5094483edefeac9510e573469b",
    retry_timeout: 10_000,
    token: undefined,
    session_key: undefined,
};

export async function startup() {
    // TODO: get stored config
    if (!config.session_key) {
        await authenticate(config);
    }
}

/**
 * @param {string} title
 * @param {string} artist
 * @param {number} duration
 * @returns {Promise<void>}
 */
export async function postSong(title, artist, duration) {
    return await postSongDataToAPI(
        {
            title,
            artist,
            duration,
        },
        config
    );
}
