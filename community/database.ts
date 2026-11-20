import pg from 'pg';

export interface Query {query(sql:string, args?:unknown[]):Promise<{rows:any[]}>}
export interface Database extends Query {transaction<T>(fn:(db:Query)=>Promise<T>):Promise<T>}
export interface Objects {get(key:string):Promise<Buffer|null>;put(key:string,bytes:Buffer):Promise<void>;remove(key:string):Promise<void>}

export function postgres(url:string):Database {
  const pool=new pg.Pool({connectionString:url,max:3,idleTimeoutMillis:5_000,connectionTimeoutMillis:8_000});
  return {
    query:(sql,args)=>pool.query(sql,args),
    async transaction(fn){
      const client=await pool.connect();
      try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
      catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}
      finally{client.release();}
    }
  };
}

const tables=[
  `CREATE TABLE IF NOT EXISTS accounts (id text PRIMARY KEY, username text NOT NULL, login text UNIQUE NOT NULL, password text NOT NULL, recovery text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (token text PRIMARY KEY, account text NOT NULL REFERENCES accounts(id), expires timestamptz NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS works (id text PRIMARY KEY, account text NOT NULL REFERENCES accounts(id), created timestamptz NOT NULL DEFAULT now(), updated timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true, latest text NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS releases (id text PRIMARY KEY, work text NOT NULL REFERENCES works(id), version text NOT NULL, title text NOT NULL, description text NOT NULL, manifest jsonb NOT NULL, bytes int NOT NULL, cover text, previews jsonb NOT NULL DEFAULT '{}', UNIQUE(work,version))`,
  `CREATE TABLE IF NOT EXISTS reports (work text NOT NULL REFERENCES works(id), visitor text NOT NULL, note text NOT NULL, created timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(work,visitor))`,
  `CREATE TABLE IF NOT EXISTS limits (key text PRIMARY KEY, value bigint NOT NULL DEFAULT 0, touched timestamptz NOT NULL DEFAULT now())`,
  `CREATE INDEX IF NOT EXISTS works_recent ON works (updated DESC,id DESC) WHERE active`,
];
export async function initialize(db:Query){for(const statement of tables)await db.query(statement);}
