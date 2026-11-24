import { db } from './firebase';
import { setupCorsAndAuth } from './auth';

export default async function handler(req: any, res: any) {
  if (!setupCorsAndAuth(req, res)) return;

  try {
    const snapshot = await db.collection('customers_data').get();
    const customers: any[] = [];

    snapshot.forEach((doc: any) => {
      const data = doc.data();
      customers.push({
        id: doc.id,
        customerId: data.customerId || doc.id,
        customerName: data.customerName || `صيدلية ${doc.id}`,
        lastActive: data.lastActive,
        machineId: data.machineId,
        hostname: data.hostname,
      });
    });

    res.status(200).json({ success: true, customers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
}
