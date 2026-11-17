import { writeFileSync } from "node:fs";

import { toNativeCss } from "../src/tokens/to-native-css";
import { toWebCss } from "../src/tokens/to-web-css";

writeFileSync(new URL("../src/styles/native-tokens.css", import.meta.url), toNativeCss());
writeFileSync(new URL("../src/styles/web-tokens.css", import.meta.url), toWebCss());
