import { db } from './firebase';
import { setupCorsAndAuth } from './auth';

export default async function handler(req: any, res: any) {
  if (!setupCorsAndAuth(req, res)) return;

  try {
    const settingsDoc = await db.collection('settings').doc('global').get();
    const isLocked = settingsDoc.data()?.isLocked === true;

    const devicesSnapshot = await db.collection('devices').get();
    const devices: any[] = [];
    devicesSnapshot.forEach((doc: any) => {
      devices.push({ id: doc.id, ...doc.data() });
    });

    devices.sort((a, b) => {
      const ta = a.lastSeen ? Date.parse(a.lastSeen) : 0;
      const tb = b.lastSeen ? Date.parse(b.lastSeen) : 0;
      return tb - ta;
    });

    res.status(200).json({ success: true, isLocked, devices });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
