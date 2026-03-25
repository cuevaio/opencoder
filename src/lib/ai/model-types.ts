import { z } from "zod/v4";
import { allowedModelIds, keyProviderIds } from "./model-registry.ts";

export const modelIdSchema = z.enum(allowedModelIds as [string, ...string[]]);
export const keyProviderSchema = z.enum(keyProviderIds);
