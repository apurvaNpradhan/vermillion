import { writeFileSync } from "node:fs";

import { toNativeCss } from "../src/tokens/to-native-css";
import { toWebCss } from "../src/tokens/to-web-css";

writeFileSync(new URL("../src/styles/tokens.css", import.meta.url), toWebCss());
writeFileSync(new URL("../src/styles/native-tokens.css", import.meta.url), toNativeCss());
