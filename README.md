# Ergo Employee Management System (HRMS)

An enterprise-ready, auditable Employee Salary, Leave & Daily Attendance Management System built with Node.js, Express, PostgreSQL, and React + Vite.

---

## 🌟 Key Highlights & Business Capabilities

- **🔐 Strict Role-Based Access Control (RBAC)**: Distinct permissions for `admin` and `employee`. First-login forced password change, bcrypt work-factor 12, and JWT authentication with session expiration handling.
- **⏱️ Daily Attendance System**: Mandatory blocking check-in prompt on working days, supporting `Present` (100%), `Half-Day` (50%), `On Duty / Travel` (100%), and `Absent` (0%). Strict 11:59 PM IST cutoff with employee correction requests and audited admin overrides.
- **🏖️ Leave Management Workflow**: Annual reset leave balances (`Casual Leave: 12d`, `Sick Leave: 6d`, `Paid Leave: 15d`, `Unpaid Leave: 0d`). Automatic exclusion of weekends (Sat/Sun) and company holidays. Same-day leave 9:00 AM IST cutoff, overlap blocking, and transactional balance deductions on approval.
- **🧮 Deterministic Salary Computation Engine**: Per-day rate calculation evaluating actual attendance, approved leaves, and company holidays. Mid-month historical salary rate revisions are automatically resolved day-by-day.
- **📄 Official PDF Payslips & Consolidated Excel Reports**: One-click immutable payslip generation with vector PDF downloads (`pdfkit`) and styled company-wide payroll exports (`exceljs`).
- **🕒 Asia/Kolkata (IST) Timezone Enforcement**: Every date check, attendance cutoff, and holiday evaluation strictly runs in `Asia/Kolkata`.
- **🎨 Themeable, Icon-Driven UI**: Consistent dark/light theme (toggle in every header) built on CSS custom properties, with a `lucide-react` icon system and shared `icon-chip` / status-pill design tokens across all admin and employee screens.

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies / Libraries |
|---|---|
| **Frontend** | React 18, Vite, React Router 6, Axios, `lucide-react` icons, Vanilla CSS Design System with dark/light theming |
| **Backend** | Node.js (>=18), Express, Helmet, CORS, Express-Validator, Express-Rate-Limit |
| **Database** | PostgreSQL (>=14), `pg` connection pool, SQL migration runner |
| **Security & Auth** | JWT (`jsonwebtoken`), `bcryptjs`, Rate Limiting, HTTP security headers |
| **Document Generation** | `pdfkit` (PDF Payslips), `exceljs` (Excel Payroll Workbooks) |
| **Testing** | Jest, Supertest (127 automated test cases passing) |

---

## 📁 Repository Structure

```
employee_managment_system/
├── backend/
│   ├── src/
│   │   ├── __tests__/        # Automated test suites (auth, users, attendance, leaves, salary)
│   │   ├── controllers/      # API controller handlers
│   │   ├── db/
│   │   │   ├── migrations/   # Sequential SQL migrations (001 to 008)
│   │   │   ├── migrate.js    # Migration runner
│   │   │   ├── pool.js       # PostgreSQL connection pool with health check
│   │   │   └── seed.js       # Database seeder (Initial Admin)
│   │   ├── middleware/       # JWT Auth, RBAC, Error Handler
│   │   ├── routes/           # Express router endpoints
│   │   ├── services/         # Salary computation engine & PDF/Excel report generators
│   │   ├── utils/            # IST time utilities, token signing, ID generation
│   │   ├── app.js            # Express app configuration
│   │   └── server.js         # HTTP server entry point
│   ├── .env.example          # Safe environment variables template
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── api/              # Axios API clients
│   │   ├── components/       # Layouts, Modal, Toast, Theme Toggle
│   │   ├── context/          # Auth & Theme context, session management
│   │   ├── pages/            # Admin & Employee portal pages
│   │   ├── routes/           # Protected routes & App router
│   │   ├── index.css         # Global design tokens and utilities
│   │   └── main.jsx          # React app entry point
│   ├── .env.example
│   └── package.json
└── README.md
```

---

## 🚀 Local Development Setup

### 1. Prerequisites
- **Node.js**: >= 18.0.0
- **PostgreSQL**: >= 14.0.0

---

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your local PostgreSQL credentials

# Run database migrations
npm run migrate

# Seed initial admin account
npm run seed

# Start development server
npm run dev
```

---

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

- **Frontend URL**: `http://localhost:5173`
- **Backend API URL**: `http://localhost:5000`

---

## 🔑 Initial Admin Credentials

After running `npm run seed`:

| Field | Value |
|---|---|
| **Employee ID** | `ADMIN001` |
| **Email** | `admin@ergo.com` |
| **Password** | `Admin@1234` |

*(On first login, you will be prompted to set a permanent, secure password).*

---

## 🧪 Automated Testing & Production Build

### Running Backend Tests
```bash
cd backend
npm test
```
*Result: 127/127 tests pass across 6 suites (`auth`, `users`, `phase2`, `attendance`, `leaves`, `salary`).*

### Building Frontend Production Bundle
```bash
cd frontend
npm run build
```
*Result: Clean compilation into `dist/` with 0 errors.*

---

## ⚙️ Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | API server port (default: `5000`) |
| `TZ` | Yes | Must be `Asia/Kolkata` |
| `DB_HOST` | Yes | PostgreSQL server host (`localhost`) |
| `DB_PORT` | Yes | PostgreSQL port (`5432`) |
| `DB_NAME` | Yes | Database name (`ergo_employee_management`) |
| `DB_USER` | Yes | Database user (`postgres`) |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | Cryptographic secret for signing JWT tokens (min 32 chars) |
| `JWT_EXPIRES_IN` | Yes | Token expiration duration (default: `8h`) |
| `BCRYPT_SALT_ROUNDS` | Yes | Work factor for password hashing (default: `12`) |
| `FRONTEND_URL` | Yes | Permitted CORS frontend origin (`http://localhost:5173`) |

---

## 🌐 Production Deployment Readiness

When deploying to a production server (e.g. AWS EC2, DigitalOcean, Render, Heroku):

1. **Database Provisioning**:
   - Create a PostgreSQL database instance.
   - Run `npm run migrate` to apply all 8 migrations sequentially.
   - Run `npm run seed` once to create the root Administrator.
2. **Environment Variables**:
   - Provide high-entropy `JWT_SECRET` (`openssl rand -hex 32`).
   - Set `NODE_ENV=production`.
   - Set `FRONTEND_URL=https://your-domain.com`.
3. **Health Check Endpoints**:
   - Basic liveness: `GET /api/health`
   - Database readiness & latency check: `GET /api/db-health`
4. **HTTPS & Security**:
   - Ensure an SSL/TLS reverse proxy (e.g., Nginx, Caddy, Cloudflare) handles HTTPS termination.
   - Set cookie/token transport over secure headers.
