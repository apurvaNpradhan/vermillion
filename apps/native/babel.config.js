module.exports = {
  presets: ["babel-preset-expo"],
  plugins: [require("./babel-plugins/hermes-async-arrow-rest-params")],
};
