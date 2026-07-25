
## Features

- Share files using a link
- Unlimited file size (restricted only by disk space)
- Set an expiration date for shares
- Secure shares with visitor limits and passwords
- Email recipients
- Upload only by the authenticated owner (no reverse shares)
- Integration with ClamAV for security scans
- Local-only storage on the server (no S3 providers)
- Automatic password generation with shareable link (configurable length)
- Per-share limits: max views, max downloads, expiration
- Dedicated share-viewing page (no admin chrome when accessing via link)
- Full audit log of views and downloads (IP, user-agent, timestamp, success/failure)
- Admin dashboard for download/view logs with filters and pagination
- Role-based access control (admin / operator / auditor)
- Forced password change on first login for admin-created users

## Setup

### Installation with Docker (recommended)

1. Download the `docker-compose.yml` file
2. Run `docker compose up -d`

The website is now listening on `http://localhost:3000`.

### Setup project

#### Backend

1. Open the `backend` folder
2. Install the dependencies with `npm install`
3. Push the database schema to the database by running `npx prisma db push`
4. Seed the database with `npx prisma db seed`
5. Start the backend with `npm run dev`

#### Frontend

1. Start the backend first
2. Open the `frontend` folder
3. Install the dependencies with `npm install`
4. Start the frontend with `npm run dev`

You're all set!

#### Testing

At the moment we only have system tests for the backend. To run these tests, run `npm run test:system` in the backend folder.
