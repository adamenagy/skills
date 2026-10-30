#!/usr/bin/env node
// Minimal Automation API (Design Automation v3) CLI for Inventor AppBundles. Node 20+, no dependencies.
//
// Credentials come from APS_CLIENT_ID / APS_CLIENT_SECRET (2-legged). Secrets and tokens are never printed.
// APS_BASE_URL overrides https://developer.api.autodesk.com (used by the mock-server test).
//
//   node da.mjs engines [filter]
//   node da.mjs nickname [set <name>]
//   node da.mjs publish-appbundle --id <id> --zip <file> --engine <engine> [--alias dev] [--description <text>]
//   node da.mjs publish-activity  --spec <activity.json> [--alias dev] [--bundle-alias dev]
//   node da.mjs oss-put <bucket> <objectKey> <file>      (creates the transient bucket if needed)
//   node da.mjs oss-get <bucket> <objectKey> <file>
//   node da.mjs run <activityId+alias> --args <args.json> [--wait]   ("$TOKEN" in args.json is replaced by the token)

import { readFile, writeFile } from 'node:fs/promises';

const BASE = process.env.APS_BASE_URL ?? 'https://developer.api.autodesk.com';
const DA = `${BASE}/da/us-east/v3`;
const SCOPES = 'code:all bucket:create bucket:read data:create data:write data:read';

const die = (msg) => { console.error(`error: ${msg}`); process.exit(1); };

let cachedToken;
async function token() {
    if (cachedToken) return cachedToken;
    const id = process.env.APS_CLIENT_ID, secret = process.env.APS_CLIENT_SECRET;
    if (!id || !secret) die('set APS_CLIENT_ID and APS_CLIENT_SECRET');
    const res = await fetch(`${BASE}/authentication/v2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', scope: SCOPES }),
    });
    if (!res.ok) die(`token request failed: ${res.status} ${await res.text()}`);
    cachedToken = (await res.json()).access_token;
    return cachedToken;
}

// Returns { status, body }. Never throws on HTTP errors so callers can branch on 404/409.
async function api(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${await token()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { status: res.status, body: parsed };
}

function must(r, what) {
    if (r.status < 200 || r.status >= 300) die(`${what} failed: HTTP ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
}

function flags(argv) {
    const out = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const k = argv[i].slice(2);
            out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
        } else out._.push(argv[i]);
    }
    return out;
}

async function nickname() {
    const r = await api('GET', `${DA}/forgeapps/me`);
    return r.status === 200 && typeof r.body === 'string' ? r.body : null; // returns the nickname as a JSON string
}

async function setAlias(kind, id, alias, version) {
    const created = await api('POST', `${DA}/${kind}/${id}/aliases`, { id: alias, version });
    if (created.status === 409) must(await api('PATCH', `${DA}/${kind}/${id}/aliases/${alias}`, { version }), `repoint alias ${alias}`);
    else must(created, `create alias ${alias}`);
}

const commands = {
    async engines([filter]) {
        let all = [], page;
        do {
            const b = must(await api('GET', `${DA}/engines${page ? `?page=${encodeURIComponent(page)}` : ''}`), 'list engines');
            all = all.concat(b.data); page = b.paginationToken;
        } while (page);
        console.log(all.filter((e) => !filter || e.toLowerCase().includes(filter.toLowerCase())).sort().join('\n'));
    },

    async nickname([action, name]) {
        if (action === 'set') {
            if (!name) die('usage: nickname set <name>');
            const r = await api('PATCH', `${DA}/forgeapps/me`, { nickname: name });
            if (r.status === 409) die('nickname already taken, or the app already has data (then DELETE /forgeapps/me first)');
            must(r, 'set nickname');
        }
        console.log(await nickname() ?? '(no nickname set; the client id is used instead)');
    },

    async 'publish-appbundle'(_, f) {
        for (const k of ['id', 'zip', 'engine']) if (!f[k]) die(`--${k} is required`);
        const alias = f.alias ?? 'dev';
        const zip = await readFile(f.zip);
        const description = f.description ?? `${f.id} AppBundle`;

        let r = await api('POST', `${DA}/appbundles`, { id: f.id, engine: f.engine, description });
        if (r.status === 409) r = await api('POST', `${DA}/appbundles/${f.id}/versions`, { engine: f.engine, description });
        const created = must(r, 'register appbundle');

        // Upload to the pre-signed S3 form; every formData field must be sent, with `file` last.
        const form = new FormData();
        for (const [k, v] of Object.entries(created.uploadParameters.formData)) form.append(k, v);
        form.append('file', new Blob([zip]), `${f.id}.zip`);
        const up = await fetch(created.uploadParameters.endpointURL, { method: 'POST', body: form });
        if (!up.ok) die(`upload failed: HTTP ${up.status} ${await up.text()}`);

        await setAlias('appbundles', f.id, alias, created.version);
        console.log(`${created.id}+${alias} -> version ${created.version} (${f.engine})`);
    },

    async 'publish-activity'(_, f) {
        if (!f.spec) die('--spec is required');
        const alias = f.alias ?? 'dev', bundleAlias = f['bundle-alias'] ?? 'dev';
        const spec = JSON.parse(await readFile(f.spec, 'utf8'));
        const nick = await nickname();
        if (!nick) die('this app has no nickname yet; run `nickname set <name>` first (it must be done before the app has any data)');
        // Qualify bare appbundle ids as <nickname>.<id>+<alias>; commandLine keeps the bare id.
        spec.appbundles = (spec.appbundles ?? []).map((b) => (b.includes('.') ? b : `${nick}.${b}+${bundleAlias}`));

        let r = await api('POST', `${DA}/activities`, spec);
        if (r.status === 409) {
            const { id, ...rest } = spec;
            r = await api('POST', `${DA}/activities/${id}/versions`, rest);
        }
        const act = must(r, 'create activity');
        await setAlias('activities', spec.id, alias, act.version);
        console.log(`${nick}.${spec.id}+${alias} -> version ${act.version}`);
    },

    async 'oss-put'([bucket, key, file]) {
        if (!bucket || !key || !file) die('usage: oss-put <bucket> <objectKey> <file>');
        const mk = await api('POST', `${BASE}/oss/v2/buckets`, { bucketKey: bucket, policyKey: 'transient' });
        if (mk.status !== 409) must(mk, 'create bucket');
        const path = `${BASE}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(key)}`;
        const signed = must(await api('GET', `${path}/signeds3upload?parts=1`), 'get signed upload URL');
        const put = await fetch(signed.urls[0], { method: 'PUT', body: await readFile(file) });
        if (!put.ok) die(`S3 upload failed: HTTP ${put.status}`);
        must(await api('POST', `${path}/signeds3upload`, { uploadKey: signed.uploadKey }), 'complete upload');
        console.log(`urn:adsk.objects:os.object:${bucket}/${key}`);
    },

    async 'oss-get'([bucket, key, file]) {
        if (!bucket || !key || !file) die('usage: oss-get <bucket> <objectKey> <file>');
        const signed = must(await api('GET', `${BASE}/oss/v2/buckets/${bucket}/objects/${encodeURIComponent(key)}/signeds3download`), 'get signed download URL');
        const res = await fetch(signed.url);
        if (!res.ok) die(`S3 download failed: HTTP ${res.status}`);
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        console.log(`saved ${file}`);
    },

    async run([activityId], f) {
        if (!activityId || !f.args) die('usage: run <nickname.Activity+alias> --args <args.json> [--wait]');
        const raw = (await readFile(f.args, 'utf8')).replaceAll('$TOKEN', await token());
        const wi = must(await api('POST', `${DA}/workitems`, { activityId, arguments: JSON.parse(raw).arguments ?? JSON.parse(raw) }), 'create workitem');
        console.log(`workitem ${wi.id}: ${wi.status}`);
        if (!f.wait) return;

        let cur = wi;
        while (['pending', 'inprogress'].includes(cur.status)) {
            await new Promise((r) => setTimeout(r, 5000));
            cur = must(await api('GET', `${DA}/workitems/${wi.id}`), 'poll workitem');
            console.log(`  ${cur.status}`);
        }
        if (cur.reportUrl) {
            const rep = await fetch(cur.reportUrl); // pre-signed; no auth header
            console.log('--- report ---\n' + (rep.ok ? await rep.text() : `(report fetch failed: HTTP ${rep.status})`));
        }
        if (cur.status !== 'success') process.exit(2);
    },
};

const [cmd, ...rest] = process.argv.slice(2);
if (!commands[cmd]) die(`unknown command "${cmd ?? ''}". See the header of this file for usage.`);
const f = flags(rest);
await commands[cmd](f._, f);
