import { writeFileSync } from "node:fs";

import { toNativeCss } from "../src/tokens/to-native-css";

writeFileSync(new URL("../src/styles/native-tokens.css", import.meta.url), toNativeCss());
