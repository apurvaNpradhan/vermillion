// Local oxlint plugin: `hermes/no-es2023-array-methods`.
//
// The app runs on Hermes, which lacks the ES2023 copying and search-from-end array methods. Node
// has them, so unit tests pass while the same call throws "undefined is not a function" on the
// device. The rule is switched on only for code that ships in the app (see `.oxlintrc.json`).
const METHODS = new Set(["toSorted", "toReversed", "toSpliced", "findLast", "findLastIndex"]);

const ALTERNATIVE = {
  toSorted: "[...array].sort(...)",
  toReversed: "[...array].reverse()",
  toSpliced: "a copy then splice",
  findLast: "[...array].reverse().find(...)",
  findLastIndex: "a reverse loop",
};

const rule = {
  meta: {
    type: "problem",
    docs: { description: "Do not call ES2023 array methods that Hermes does not implement." },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== "Identifier") return;
        const name = node.property.name;
        if (!METHODS.has(name)) return;
        context.report({
          node: node.property,
          message: `Hermes has no Array.prototype.${name}; use ${ALTERNATIVE[name]}.`,
        });
      },
    };
  },
};

export default {
  meta: { name: "hermes" },
  rules: { "no-es2023-array-methods": rule },
};
