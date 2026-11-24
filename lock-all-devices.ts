import { db } from './firebase';
import { setupCorsAndAuth } from './auth';

export default async function handler(req: any, res: any) {
  if (!setupCorsAndAuth(req, res)) return;

  try {
    const snapshot = await db.collection('devices').get();
    const batch = db.batch();
    const now = new Date().toISOString();
    snapshot.forEach((doc: any) => {
      batch.set(doc.ref, { isApproved: false, updatedAt: now }, { merge: true });
    });
    await batch.commit();
    res.status(200).json({ success: true, lockedCount: snapshot.size });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
