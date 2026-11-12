import "./src/platform/local-database/crypto-polyfill";
import "./src/platform/i18n/polyfills";
import { AppRegistry } from "react-native";
import { workoutLiveAction } from "./src/session/workout-live";
AppRegistry.registerHeadlessTask("WorkoutLiveAction", () => workoutLiveAction);
import "expo-router/entry";
