# WASender

WhatsApp multi-session panel (Node.js + Baileys).

## Local

```bash
npm install
npm start
```

Open http://localhost:3000

Default admin (if auth enabled): `admin` / `admin123`

## GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

## Render (free)

1. https://render.com — sign up with GitHub  
2. **New → Web Service** → select this repo  
3. Settings:
   - Build: `npm install`
   - Start: `npm start`
   - Plan: **Free**
4. Deploy → use the `https://….onrender.com` URL

The server binds to `0.0.0.0` and uses `process.env.PORT`.

**Notes:** Free tier sleeps after ~15 min idle. Session files may reset on redeploy without a paid disk.
