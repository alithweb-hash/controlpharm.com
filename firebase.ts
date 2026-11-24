import * as admin from 'firebase-admin';

function getCredentials(): admin.ServiceAccount {
  const raw = process.env.FIREBASE_KEY?.trim();
  if (!raw) {
    throw new Error(
      'Missing FIREBASE_KEY environment variable. Add your firebase-key.json contents to Vercel Environment Variables.'
    );
  }
  const parsed = JSON.parse(raw);
  if (!parsed.project_id || !parsed.private_key) {
    throw new Error('Invalid FIREBASE_KEY JSON format.');
  }
  if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

if (!admin.apps.length) {
  const creds = getCredentials();
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}

export const db = admin.firestore();
