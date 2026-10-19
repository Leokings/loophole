import { endpointFor, requireStage } from "./deployment-shared.mjs";
import { installRpcRetries } from "./v7-runner-runtime.mjs";

installRpcRetries(endpointFor(requireStage("studionet")));
