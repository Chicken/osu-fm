const Store = require("electron-store");

const store = new Store({
    name: "data",
    schema: {
        token: {
            type: "string",
        },
        session_key: {
            type: "string",
        },
    },
});

module.exports.store = store;
