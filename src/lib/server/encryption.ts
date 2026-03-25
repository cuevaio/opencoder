import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function parseMasterKey(rawKey: string): Buffer {
	const trimmed = rawKey.trim();

	if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) {
		return Buffer.from(trimmed, "hex");
	}

	const buffer = Buffer.from(trimmed, "base64");
	if (buffer.length === 32) {
		return buffer;
	}

	throw new Error(
		"OPENCODER_KEYS_MASTER_KEY must be 32 bytes (base64) or 64-char hex",
	);
}

function getMasterKey(): Buffer {
	const rawKey = process.env.OPENCODER_KEYS_MASTER_KEY;
	if (!rawKey) {
		throw new Error("OPENCODER_KEYS_MASTER_KEY is required");
	}

	return parseMasterKey(rawKey);
}

export interface EncryptedSecret {
	ciphertext: string;
	iv: string;
	authTag: string;
	keyVersion: number;
}

export function encryptSecret(secret: string): EncryptedSecret {
	const masterKey = getMasterKey();
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, masterKey, iv);

	const encrypted = Buffer.concat([
		cipher.update(secret, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	return {
		ciphertext: encrypted.toString("base64"),
		iv: iv.toString("base64"),
		authTag: authTag.toString("base64"),
		keyVersion: 1,
	};
}

export function decryptSecret(payload: {
	ciphertext: string;
	iv: string;
	authTag: string;
}): string {
	const masterKey = getMasterKey();
	const decipher = createDecipheriv(
		ALGORITHM,
		masterKey,
		Buffer.from(payload.iv, "base64"),
	);

	decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));

	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(payload.ciphertext, "base64")),
		decipher.final(),
	]);

	return decrypted.toString("utf8");
}

export function maskSecret(secret: string): string {
	return secret.slice(-4);
}
