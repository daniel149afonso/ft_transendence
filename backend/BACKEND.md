 1. Structure des dossiers
  Tu as créé backend/, backend/src/, backend/prisma/ et nginx/ — la base du monorepo.

  2. Initialisation Node.js
  npm init -y dans backend/ — ça crée le package.json qui décrit ton projet et ses dépendances.

  3. Installation des dépendances
  - Production : express, socket.io, @prisma/client, jsonwebtoken, bcrypt, cors, dotenv
  - Dev : typescript, ts-node, nodemon, prisma et tous les @types/

  4. Configuration TypeScript
  tsconfig.json — dit au compilateur que ton source est dans src/ et que le JavaScript compilé va dans
  dist/.

  5. Scripts npm
  Dans package.json : dev (nodemon en local), build (compile TS→JS), start (lance en prod).

  6. Point d'entrée du serveur
  src/index.ts — crée l'app Express, configure CORS, attache Socket.IO au serveur HTTP, expose une route
   /health. Testé et fonctionnel sur localhost:3000.

  7. .gitignore backend
  node_modules, dist, .env — pour ne jamais commiter les dépendances ni les secrets.

  8. Prisma
  - prisma/schema.prisma — connecté à PostgreSQL via la DATABASE_URL du .env
  - Modèle User écrit et validé — 7 champs : id, username, email, password, avatar, isOnline, createdAt
