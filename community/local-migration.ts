import fs from 'node:fs/promises';
import path from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {groupedManifest, parseShare} from '../src/core/share';
import type {ShareManifest} from '../src/share-types';
import {searchFields} from './app';
import type {Objects, Statement} from './database';
import {localDatabase} from './sqlite';

type LegacyRelease = {id:string; work:string; version:string; title:string; description:string; manifest:ShareManifest;
  bytes:number; cover:string|null; previews:Record<string,string>};
type LegacyWork = {id:string; account:string; username:string; latest:string; active:boolean; created:Date; updated:Date};

export async function migrateLocalCatalog(data: string, catalog: string, objects: Pick<Objects, 'get'|'size'>) {
  const source = path.join(data, 'postgres');
  if (await fs.stat(catalog).catch(() => null) || !(await fs.stat(path.join(source, 'PG_VERSION')).catch(() => null))) return;
  const staging = await fs.mkdtemp(path.join(data, 'catalog-migration-'));
  try {
    const copy = path.join(staging, 'postgres');
    await fs.cp(source, copy, {recursive:true});
    const pg = new PGlite(copy);
    const target = path.join(staging, 'catalog.sqlite');
    const sqlite = localDatabase(target);
    const statements: Statement[] = [];
    try {
      const existing = await pg.query<{accounts:string|null}>("SELECT to_regclass('accounts') AS accounts");
      if (!existing.rows[0].accounts) return;
      for (const row of (await pg.query<{id:string; username:string; login:string; password:string; recovery:string}>(
        'SELECT id,username,login,password,recovery FROM accounts')).rows) {
        statements.push({sql:'INSERT INTO accounts (id,username,login,password,recovery) VALUES (?,?,?,?,?)',
          args:[row.id,row.username,row.login,row.password,row.recovery]});
      }
      const {rows: works} = await pg.query<LegacyWork>('SELECT w.*, a.username FROM works w JOIN accounts a ON a.id=w.account');
      const releases = new Map<string, LegacyRelease[]>();
      for (const release of (await pg.query<LegacyRelease>('SELECT * FROM releases ORDER BY version')).rows) {
        const revisions = releases.get(release.work) ?? [];
        revisions.push(release);
        releases.set(release.work, revisions);
      }
      for (const work of works) {
        statements.push({sql:'INSERT INTO works (id,account,created) VALUES (?,?,?)',
          args:[work.id,work.account,new Date(work.created).toISOString()]});
        let previous: string | null = null;
        const revisions = releases.get(work.id) ?? [];
        for (const release of [...revisions.filter(row => row.id !== work.latest), ...revisions.filter(row => row.id === work.latest)]) {
          let manifest = release.manifest;
          if (!manifest.groups) {
            const bytes = await objects.get(`design/${work.id}/${release.id}`);
            if (bytes) manifest = groupedManifest(manifest, parseShare(bytes).design);
          }
          const [root, levels] = searchFields(release.title,release.description,work.username,manifest);
          const images = [release.cover, ...Object.values(release.previews)].filter((key): key is string => Boolean(key));
          const imageSizes = await Promise.all(images.map(key => objects.size(key)));
          statements.push({sql:`INSERT INTO releases (id,work,previous,version,title,description,manifest,search_root,search_levels,scope,bytes,cover,previews,image_bytes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            args:[release.id,work.id,previous,release.version,release.title,release.description,JSON.stringify(manifest),
              root,levels,manifest.scope,release.bytes,release.cover,JSON.stringify(release.previews),imageSizes.reduce<number>((total,size)=>total+(size??0),0)]});
          previous = release.id;
        }
        statements.push({sql:'UPDATE works SET updated=?,active=? WHERE id=?',
          args:[new Date(work.updated).toISOString(),work.active?1:0,work.id]});
      }
      for (const row of (await pg.query<{token:string;account:string;expires:Date}>('SELECT * FROM sessions WHERE expires>now()')).rows) {
        statements.push({sql:'INSERT INTO sessions (token,account,expires) VALUES (?,?,?)',
          args:[row.token,row.account,new Date(row.expires).toISOString()]});
      }
      for (const row of (await pg.query<{work:string;visitor:string;note:string;created:Date}>('SELECT * FROM reports')).rows) {
        statements.push({sql:'INSERT INTO reports (work,visitor,note,created) VALUES (?,?,?,?)',
          args:[row.work,row.visitor,row.note,new Date(row.created).toISOString()]});
      }
      for (const row of (await pg.query<{key:string;value:string}>("SELECT key,value FROM limits WHERE key<>'storage'")).rows) {
        statements.push({sql:'INSERT INTO limits (key,value) VALUES (?,?)',args:[row.key,Number(row.value)]});
      }
      await sqlite.batch(statements);
    } finally {
      sqlite.close();
      await pg.close();
    }
    await fs.link(target, catalog).catch(error => { if (error.code !== 'EEXIST') throw error; });
  } finally {
    // This directory is an isolated copy created by mkdtemp under the local data root.
    await fs.rm(staging, {recursive:true,force:true});
  }
}
