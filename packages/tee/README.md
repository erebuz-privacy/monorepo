# Payment - Bun Web Server

A simple, lightweight web server built with [Bun](https://bun.sh) and TypeScript, featuring a custom router implementation.

## Features

- 🚀 Built with Bun for high performance
- 📘 Written in TypeScript with full type safety
- 🛣️ Custom router implementation supporting multiple HTTP methods
- 🗄️ PostgreSQL database with Prisma ORM
- 🔍 ESLint configuration for code quality
- 📝 Comprehensive logging with file and line number tracking
- ⚡ Fast and efficient request handling

## Prerequisites

- [Bun](https://bun.sh) installed on your system
  - Install via: `curl -fsSL https://bun.sh/install | bash`
- PostgreSQL database (version 12 or higher)
  - Install PostgreSQL from [postgresql.org](https://www.postgresql.org/download/)
  - Or use Docker: `docker run --name postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres`

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd payment
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment variables:
```bash
# Create .env file from .env.example (if exists)
cp .env.example .env

# Edit .env and set your DATABASE_URL
# Example: DATABASE_URL="postgresql://user:password@localhost:5432/payment?schema=public"
```

4. Set up the database:
```bash
# Generate Prisma Client (run this after adding models to schema.prisma)
bun run db:generate

# Create and run database migrations
bun run db:migrate
```

## Usage

### Start the server

```bash
bun run start
```

Or simply:
```bash
bun index.ts
```

The server will start on `http://localhost:3000`

### Development

Run the server in development mode:
```bash
bun run dev
```

## Available Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Returns "Hello World" |
| GET | `/about` | Returns "About Page" |
| GET | `/api/hello` | Returns JSON response with greeting |
| POST | `/api/data` | Accepts JSON data and returns confirmation |

## Testing the API

### Get Requests

```bash
# Home page
curl http://localhost:3000/

# About page
curl http://localhost:3000/about

# API endpoint
curl http://localhost:3000/api/hello
```

### Post Request

```bash
curl -X POST http://localhost:3000/api/data \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "age": 30}'
```

## Scripts

### Server
- `bun run start` - Start the server
- `bun run dev` - Run in development mode

### Database
- `bun run db:generate` - Generate Prisma Client from schema
- `bun run db:migrate` - Create and apply database migrations (development)
- `bun run db:migrate:deploy` - Apply pending migrations (production)
- `bun run db:migrate:status` - Check migration status
- `bun run db:studio` - Open Prisma Studio (database GUI)
- `bun run db:seed` - Run database seed scripts

### Testing
- `bun run test` - Run all tests
- `bun run test:unit` - Run unit tests only
- `bun run test:integration` - Run integration tests only
- `bun run test:e2e` - Run end-to-end tests only

### Code Quality
- `bun run lint` - Run ESLint to check code quality
- `bun run lint:fix` - Run ESLint and auto-fix issues

## Router API

The router supports the following HTTP methods:

```typescript
// GET request
router.get('/path', (request, url) => {
  return new Response('Hello', {
    headers: { 'Content-Type': 'text/plain' }
  });
});

// POST request
router.post('/path', async (request, url) => {
  const body = await request.json();
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// PUT request
router.put('/path', handler);

// DELETE request
router.delete('/path', handler);

// Handle any HTTP method
router.all('/path', handler);
```

## Database Setup

### Initial Setup

1. **Create a PostgreSQL database:**
   ```bash
   # Using psql
   createdb payment

   # Or using SQL
   psql -U postgres
   CREATE DATABASE payment;
   ```

2. **Configure environment variables:**
   Create a `.env` file in the project root:
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/payment?schema=public"
   NODE_ENV="development"
   PRIVATE_KEY="0x..." # Private key for wallet operations (required for Chain Manager)
   ```

3. **Add your models to `prisma/schema.prisma`**

4. **Generate Prisma Client:**
   ```bash
   bun run db:generate
   ```

5. **Create and apply migrations:**
   ```bash
   bun run db:migrate
   ```

### Database Management

- **View your database:** Run `bun run db:studio` to open Prisma Studio
- **Check migration status:** Run `bun run db:migrate:status`
- **Create a new migration:** Make changes to `prisma/schema.prisma`, then run `bun run db:migrate`

### Using the Database

The database manager is available through:
```typescript
import { dbManager, prisma } from './src/managers/db';

// Connect to database
await dbManager.connect();

// Use Prisma client directly
const users = await prisma.user.findMany();

// Use transaction
await dbManager.transaction(async (tx) => {
  // Your transaction logic
});

// Health check
const isHealthy = await dbManager.healthCheck();
```

## Project Structure

```
payment/
├── index.ts                    # Main server file
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── prisma/
│   └── schema.prisma          # Prisma schema file
├── src/
│   ├── api/                   # API layer
│   │   ├── routes/            # Route handlers
│   │   └── middleware/        # Request/response middleware
│   ├── services/              # Business logic services
│   ├── managers/              # Infrastructure managers
│   │   ├── db/                # Database manager
│   │   ├── log/               # Log manager
│   │   └── ...
│   ├── database/              # Database layer
│   │   ├── models/            # Database models
│   │   ├── migrations/        # Database migrations
│   │   └── seeds/             # Database seeds
│   ├── config/                # Configuration files
│   ├── types/                 # TypeScript type definitions
│   └── utils/                 # Utility functions
├── tests/                     # Test files
│   ├── unit/                  # Unit tests
│   ├── integration/           # Integration tests
│   ├── e2e/                   # End-to-end tests
│   └── helpers/               # Test helpers
├── .eslintrc.json             # ESLint configuration
├── .eslintignore              # ESLint ignore patterns
├── .gitignore                 # Git ignore patterns
└── README.md                  # This file
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **Router**: [itty-router](https://github.com/kwhitley/itty-router)
- **Database**: PostgreSQL with [Prisma ORM](https://www.prisma.io/)
- **Linter**: ESLint with TypeScript support
- **Testing**: Bun's built-in test runner

## License

ISC

