import Store from "electron-store";

export const store = new Store({
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
