import { db } from './firebase';
import { setupCorsAndAuth } from './auth';

export default async function handler(req: any, res: any) {
  if (!setupCorsAndAuth(req, res)) return;

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const { isLocked } = body;

  try {
    await db
      .collection('settings')
      .doc('global')
      .set({ isLocked: !!isLocked, updatedAt: new Date().toISOString() }, { merge: true });
    res.status(200).json({ success: true, isLocked: !!isLocked });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
