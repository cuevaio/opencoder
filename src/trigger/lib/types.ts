/**
 * Minimal interface for Trigger.dev metadata operations
 * used across the trigger library modules.
 */
export interface MetadataHandle {
	set(key: string, value: unknown): MetadataHandle;
	del(key: string): MetadataHandle;
	flush(): Promise<void>;
}
