# Deployment Guide: Hosting on Render.com

This guide explains how to deploy your Trading AI bot to [Render.com](https://render.com), which is an excellent platform for hosting Node.js apps with continuous background processes (like your trading engine).

## Prerequisites
Before you start, you will need two things from this AI Studio workspace:
1. **Your MetaApi Token**: (The one you pasted into the UI).
2. **Your Firebase Config**: This app uses Firebase for the database. You need the contents of the `firebase-applet-config.json` file. You can download this file from the file explorer on the left pane in AI Studio, or copy its contents.

---

## Step 1: Export your code to GitHub
1. In the top right corner of the AI Studio interface, click the **Settings (gear icon)**.
2. Click **Export to GitHub**.
3. Choose to create a new repository (for example, name it `gold-swing-ai-bot`).

## Step 2: Create a Web Service on Render
1. Go to [Render.com](https://render.com) and sign up/log in.
2. Click the **"New +"** button in the dashboard and select **Web Service**.
3. Connect your GitHub account and select the repository you just created (`gold-swing-ai-bot`).

## Step 3: Configure Build & Start Commands
Fill in the following details for your new Web Service:
- **Name**: `gold-swing-ai` (or whatever you prefer)
- **Region**: Choose the one closest to you (or closest to your broker's server)
- **Branch**: `main`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm run start`

> **Note on Pricing:** Since this is a 24/7 background trading bot, you will need to select a paid tier (the $7/month Starter plan is perfect). The free tier spins down after 15 minutes of inactivity, which would cause your bot to stop trading!

## Step 4: Configure the Database (Secret File)
Because the app needs to securely connect to your Firebase database, you need to provide the config file to Render securely.
1. Scroll down to the **Advanced** section of the Render deployment page.
2. Click **Add Secret File**.
3. **Filename**: Type exactly `firebase-applet-config.json`
4. **Contents**: Paste the entire JSON contents of your `firebase-applet-config.json` file from AI Studio.

## Step 5: Configure Environment Variables
1. Still in the **Advanced** section, click **Add Environment Variable**.
2. Add the following key:
   - **Key**: `META_API_TOKEN`
   - **Value**: `Your_MetaApi_Token_Here`
3. Add any other variables you wish to override (optional):
   - **Key**: `PORT`
   - **Value**: `3000` (Render will automatically assign a port, but setting it to 3000 is standard for this app).

## Step 6: Deploy!
1. Click the **Create Web Service** button at the bottom.
2. Render will now clone your code, run `npm install`, build the frontend and backend, and start the server.
3. Once the deployment says **"Live"**, you can click the URL Render gives you (e.g., `https://gold-swing-ai-xyz.onrender.com`) to view your dashboard!

Your bot is now hosted in the cloud, monitoring the market 24/7, and will execute trades exactly as it does here.
