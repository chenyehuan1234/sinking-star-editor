export type Parameter = string | number | null;
export interface Statement {sql: string; args?: Parameter[]}
export interface Database {
  query<Row extends object = Record<string, unknown>>(sql: string, args?: Parameter[]): Promise<Row[]>;
  batch(statements: Statement[]): Promise<void>;
}

export interface Objects {
  get(key: string): Promise<Buffer | null>;
  size(key: string): Promise<number | null>;
  put(key: string, bytes: Buffer): Promise<void>;
  remove(key: string): Promise<void>;
}
