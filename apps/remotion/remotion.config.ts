import path from "path";
import { Config } from "@remotion/cli/config";

// Resolve to absolute path so it works regardless of cwd when Remotion runs
const publicDir = path.resolve(__dirname, "../../public");
Config.setPublicDir(publicDir);
Config.overrideWebpackConfig((config) => config);
