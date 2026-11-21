import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import type {Database, Parameter, Statement} from './database';

export function localDatabase(filename = ':memory:'): Database & {close(): void} {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec('BEGIN IMMEDIATE');
  try {
    const version=Number(sqlite.prepare('PRAGMA user_version').get()!.user_version);
    const migrations=['0001_community.sql','0002_work_tags.sql'];
    for(let index=version;index<migrations.length;index++){
      sqlite.exec(readFileSync(new URL('./migrations/'+migrations[index], import.meta.url), 'utf8'));
      sqlite.exec('PRAGMA user_version = '+(index+1));
    }
    sqlite.exec('COMMIT');
  } catch (error) {
    sqlite.exec('ROLLBACK');
    sqlite.close();
    throw error;
  }
  return {
    async query<Row extends object>(sql: string, args: Parameter[] = []) {
      return sqlite.prepare(sql).all(...args) as Row[];
    },
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        for (const {sql, args = []} of statements) sqlite.prepare(sql).run(...args);
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
}
