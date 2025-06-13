# Environment Variables Setup

## Quick Solution (No Environment Variables Needed!)

**For testing timeout functionality, you DON'T need any environment variables!**

Just run:
```bash
node quick-timeout-check.js
```

This gives you step-by-step instructions to manually test timeouts using Firebase Console.

## Environment Variables (Optional - For Automated Scripts Only)

If you want to run automated timeout scripts, you need these environment variables:

### Required Variables

```env
# Firebase Project ID
FIREBASE_PROJECT_ID=skillnusa-6b3ad

# Complete Service Account JSON (recommended)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"skillnusa-6b3ad",...}

# Cron Job Security
CRON_SECRET=your-secure-random-string-here
```

### How to Get Firebase Service Account Key

1. **Go to Firebase Console**
   - https://console.firebase.google.com/project/skillnusa-6b3ad

2. **Navigate to Project Settings**
   - Click gear icon → Project Settings

3. **Go to Service Accounts tab**
   - Click "Service Accounts" tab

4. **Generate New Private Key**
   - Click "Generate new private key" button
   - Download the JSON file

5. **Copy JSON Content**
   - Open downloaded JSON file
   - Copy entire content
   - Paste as value for `FIREBASE_SERVICE_ACCOUNT_KEY`

### Create .env File

Create `.env` file in `skillnusa-api` directory:

```env
FIREBASE_PROJECT_ID=skillnusa-6b3ad
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"skillnusa-6b3ad","private_key_id":"abc123","private_key":"-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxxxx@skillnusa-6b3ad.iam.gserviceaccount.com","client_id":"123456789","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40skillnusa-6b3ad.iam.gserviceaccount.com"}
CRON_SECRET=your-secure-random-string
```

### Alternative: Individual Fields

Instead of complete JSON, you can use individual fields:

```env
FIREBASE_PROJECT_ID=skillnusa-6b3ad
FIREBASE_PRIVATE_KEY_ID=your_private_key_id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour_private_key\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@skillnusa-6b3ad.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your_client_id
FIREBASE_CLIENT_CERT_URL=https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-xxxxx%40skillnusa-6b3ad.iam.gserviceaccount.com
CRON_SECRET=your-secure-random-string
```

## Testing Scripts

### With Environment Variables
```bash
# Automated timeout checking
node test-timeout-manual.js

# Debug orders
node debug-orders.js
```

### Without Environment Variables (Recommended)
```bash
# Manual timeout checking with instructions
node quick-timeout-check.js

# Simple order checking
node check-orders-simple.js
```

## Production Deployment

For Vercel deployment, set environment variables in:
- Vercel Dashboard → Project → Settings → Environment Variables

## Security Notes

1. **Never commit .env to git**
   - Add `.env` to `.gitignore`
   - Use `.env.local` for local development

2. **Keep CRON_SECRET secure**
   - Use random, long string
   - Different for development and production

3. **Firebase Service Account**
   - Keep private key secure
   - Don't share in public repositories
   - Rotate keys periodically

## Troubleshooting

### "Unable to detect a Project Id"
- Check `FIREBASE_PROJECT_ID` is set correctly
- Verify service account JSON is valid
- Try using individual fields instead of complete JSON

### "Permission denied"
- Ensure service account has Firestore permissions
- Check Firebase project access
- Verify service account is active

### "Invalid private key"
- Check private key format (includes `\n` characters)
- Ensure no extra spaces or characters
- Try regenerating service account key

## Quick Testing Workflow

1. **No Environment Setup Needed:**
   ```bash
   node quick-timeout-check.js
   ```

2. **Follow the printed instructions**

3. **Manually update orders in Firebase Console**

4. **Verify results in frontend**

This approach works 100% without any environment variable issues! 