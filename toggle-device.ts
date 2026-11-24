import { db } from './firebase';
import { setupCorsAndAuth } from './auth';

export default async function handler(req: any, res: any) {
  if (!setupCorsAndAuth(req, res)) return;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { machineId, isApproved } = body;
    if (!machineId) {
      res.status(400).json({ error: 'Machine ID is required' });
      return;
    }

    await db.collection('devices').doc(machineId).set(
      {
        isApproved: !!isApproved,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    res.status(200).json({ success: true, machineId, isApproved: !!isApproved });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
