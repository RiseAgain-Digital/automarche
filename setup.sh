#!/usr/bin/env bash
set -e

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[setup]${NC} $1"; }
success() { echo -e "${GREEN}[setup]${NC} $1"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $1"; }
error()   { echo -e "${RED}[setup]${NC} $1"; exit 1; }

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}        AutoMarche – Dev Setup          ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ─── 1. Check prerequisites ───────────────────────────────────────────────────
info "Checking prerequisites..."

command -v docker   >/dev/null 2>&1 || error "Docker is not installed. Get it at https://docs.docker.com/get-docker/"
command -v node     >/dev/null 2>&1 || error "Node.js is not installed. Get it at https://nodejs.org/"
command -v npm      >/dev/null 2>&1 || error "npm is not installed (usually comes with Node.js)."

DOCKER_COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE_CMD="docker-compose"
else
  error "Docker Compose is not installed. Get it at https://docs.docker.com/compose/install/"
fi

success "All prerequisites found."

# ─── 2. .env setup ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  info "No .env file found — creating one from .env.example..."
  cp .env.example .env

  # Generate a random 32-char secret for BETTER_AUTH_SECRET
  if command -v openssl >/dev/null 2>&1; then
    SECRET=$(openssl rand -hex 32)
    # Replace the placeholder value (works on both Linux and macOS)
    sed -i.bak "s|your-secret-key-at-least-32-chars-long|${SECRET}|" .env && rm -f .env.bak
    success ".env created with a generated BETTER_AUTH_SECRET."
  else
    warn ".env created from example. Please set a strong BETTER_AUTH_SECRET in .env before running in production."
  fi

  echo ""
  warn "ACTION REQUIRED: Open .env and fill in:"
  warn "  • N8N_WEBHOOK_SECRET — any secret string shared with your n8n workflow"
  warn "  • (optional) N8N_WEBHOOK_URL if your n8n is not on localhost:5678"
  echo ""
  read -p "Press ENTER once you've reviewed .env to continue, or Ctrl+C to abort..."
  echo ""
else
  success ".env already exists — skipping."
fi

# ─── 3. Install Node dependencies ─────────────────────────────────────────────
info "Installing Node dependencies..."
npm install
success "Dependencies installed."

# ─── 4. Start Docker services ─────────────────────────────────────────────────
info "Starting Docker services (postgres + n8n)..."
$DOCKER_COMPOSE_CMD up -d postgres n8n

# ─── 5. Wait for Postgres to be healthy ───────────────────────────────────────
info "Waiting for Postgres to be ready..."
RETRIES=20
until $DOCKER_COMPOSE_CMD exec -T postgres pg_isready -U postgres -d automarche >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    error "Postgres did not become ready in time. Run '$DOCKER_COMPOSE_CMD logs postgres' to debug."
  fi
  sleep 2
done
success "Postgres is ready."

# ─── 6. Run Prisma migrations ─────────────────────────────────────────────────
info "Running database migrations..."
npx prisma migrate deploy
success "Migrations applied."

# ─── 7. Done ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}           Setup complete!              ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Postgres  → localhost:5432"
echo -e "  n8n       → http://localhost:5678  (admin / changeme)"
echo ""
echo -e "  Start the dev server:  ${CYAN}npm run dev${NC}"
echo ""
echo -e "  Then create the first user by visiting:"
echo -e "  ${CYAN}http://localhost:3000/api/seed${NC}"
echo -e "  → email: admin@automarche.com  password: admin123"
echo ""
