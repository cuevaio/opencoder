import { z } from "zod/v4";
import {
	allowedModelIds,
	keyProviderIds,
	selectedProviderIds,
} from "./model-registry.ts";

export const modelIdSchema = z.enum(allowedModelIds as [string, ...string[]]);
export const keyProviderSchema = z.enum(keyProviderIds);

/** Variant string — validated against model's allowed variants at runtime. */
export const variantSchema = z.string().min(1).max(20);

/** Explicitly chosen provider access path. */
export const selectedProviderSchema = z.enum(
	selectedProviderIds as [string, ...string[]],
);
