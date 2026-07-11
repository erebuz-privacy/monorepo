// Database Configuration - SQLite

import path from 'path';

export const databaseConfig = {
  path: process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'tee.db'),
};
