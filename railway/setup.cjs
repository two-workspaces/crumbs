// First-boot admin for Crumbs on Railway.
//
// Upstream makes the first visitor of /setup the admin. A Railway deploy is public from its
// first second, so the admin is created here, before Crumbs listens on the public port: a
// private copy of Crumbs is started on 127.0.0.1 only, its own /api/auth/setup creates the
// account from ADMIN_EMAIL / ADMIN_PASSWORD (upstream's Argon2 hashing and schema), and it is
// stopped again. Once any account exists, upstream refuses setup for good, and Crumbs has no
// self sign-up: further users are created by the admin in Settings > Users.
//
// RESET_ADMIN_PASSWORD=true sets the admin's password back to ADMIN_PASSWORD on boot, because
// Crumbs has no forgot-password flow.
//
// Exit 0: an admin exists, start Crumbs. Exit 1: no admin could be made, so the caller serves
// a notice page instead of an open setup screen.
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawn } = require('child_process');

const log = (m) => console.log(`railway: ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const truthy = (v) => /^(1|true|yes|on)$/i.test(String(v || '').trim());
const APP = path.resolve(__dirname, '..'); // /app in the image
const DB = process.env.DATABASE_URL || '/data/crumbs.db';

function randomPassword() {
	const abc = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	return Array.from(crypto.randomBytes(20), (b) => abc[b % abc.length]).join('');
}

function adminEmail() {
	const raw = String(process.env.ADMIN_EMAIL || '').trim();
	if (/^[^\s@]+@[^\s@]+$/.test(raw)) return raw;
	log(raw ? `ADMIN_EMAIL='${raw}' is not an email address, using admin@example.com` : 'ADMIN_EMAIL is empty, using admin@example.com');
	return 'admin@example.com';
}

function adminPassword(purpose) {
	const raw = process.env.ADMIN_PASSWORD || '';
	if (raw.length >= 8) return raw;
	if (purpose === 'reset') return null;
	const made = randomPassword();
	log(`ADMIN_PASSWORD is ${raw ? 'shorter than 8 characters' : 'empty'}. The admin password is: ${made}`);
	log('sign in with it and change it in Settings > Profile');
	return made;
}

function openDb() {
	const Database = require('better-sqlite3');
	return new Database(DB);
}

function userCount() {
	if (!fs.existsSync(DB)) return 0;
	const db = openDb();
	try {
		return db.prepare('SELECT count(*) AS n FROM users').get().n;
	} catch (e) {
		if (/no such table/i.test(e.message)) return 0;
		throw e;
	} finally {
		db.close();
	}
}

async function createAdmin(email, password) {
	const port = 39000 + crypto.randomInt(1000);
	const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port) };
	delete env.ADDRESS_HEADER; // the private request carries no client-address header
	delete env.XFF_DEPTH;
	const child = spawn(process.execPath, ['build'], { cwd: APP, env, stdio: ['ignore', 'inherit', 'inherit'] });
	let exited = false;
	child.on('exit', () => (exited = true));
	const base = `http://127.0.0.1:${port}`;
	try {
		const deadline = Date.now() + 120_000;
		for (;;) {
			if (exited) throw new Error('Crumbs stopped while starting for the first-boot setup');
			try {
				await fetch(`${base}/login`, { redirect: 'manual' });
				break;
			} catch {}
			if (Date.now() > deadline) throw new Error('Crumbs did not answer on 127.0.0.1 within 120 s');
			await sleep(300);
		}
		const res = await fetch(`${base}/api/auth/setup`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password })
		});
		const body = await res.text();
		if (res.status === 201) return;
		if (res.status === 400 && /already/i.test(body)) return;
		throw new Error(`setup answered ${res.status}: ${body.slice(0, 200)}`);
	} finally {
		if (!exited) {
			child.kill('SIGTERM');
			for (let i = 0; i < 100 && !exited; i++) await sleep(100);
			if (!exited) child.kill('SIGKILL');
		}
	}
}

async function resetAdminPassword() {
	const password = adminPassword('reset');
	if (!password) {
		log('RESET_ADMIN_PASSWORD is on but ADMIN_PASSWORD has fewer than 8 characters; password left unchanged');
		return;
	}
	const argon2 = require('argon2');
	const hash = await argon2.hash(password);
	const db = openDb();
	try {
		const email = String(process.env.ADMIN_EMAIL || '').trim();
		const admin =
			db.prepare("SELECT id, email FROM users WHERE role = 'admin' AND lower(email) = lower(?)").get(email) ||
			db.prepare("SELECT id, email FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
		if (!admin) {
			log('RESET_ADMIN_PASSWORD is on but there is no admin account; nothing changed');
			return;
		}
		db.prepare('UPDATE users SET password_hash = ?, password_login_enabled = 1 WHERE id = ?').run(hash, admin.id);
		db.prepare('DELETE FROM sessions WHERE user_id = ?').run(admin.id);
		log(`RESET_ADMIN_PASSWORD: ${admin.email} now signs in with ADMIN_PASSWORD; their sessions were ended.`);
		log('remove RESET_ADMIN_PASSWORD from the variables now, or every restart resets it again');
	} finally {
		db.close();
	}
}

(async () => {
	try {
		if (userCount() === 0) {
			const email = adminEmail();
			log(`first boot: creating the admin account ${email} before Crumbs goes public`);
			const password = adminPassword('create');
			await createAdmin(email, password);
			if (userCount() === 0) throw new Error('setup reported success but no account exists');
			// Setup signed this script in; drop that session so the admin's session list starts empty.
			try {
				const db = openDb();
				try { db.prepare('DELETE FROM sessions').run(); } finally { db.close(); }
			} catch (e) {
				log(`could not clear the setup session (harmless): ${e.message}`);
			}
			const which = password === process.env.ADMIN_PASSWORD ? 'ADMIN_PASSWORD' : 'the password printed above';
			log(`admin account ready: sign in as ${email} with ${which}`);
		} else if (truthy(process.env.RESET_ADMIN_PASSWORD)) {
			// An account exists, so a failed reset must not keep Crumbs from starting.
			await resetAdminPassword().catch((e) => log(`RESET_ADMIN_PASSWORD failed: ${e.message}`));
		}
		process.exit(0);
	} catch (e) {
		log(`could not create the admin account: ${e.message}`);
		process.exit(1);
	}
})();
