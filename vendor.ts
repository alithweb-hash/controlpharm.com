import crypto from 'node:crypto';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const WHITELIST_KEY = crypto
  .createHash('sha256')
  .update('SP_WHITELIST_ENC_V1_2026_LOCKED_SECRET')
  .digest();

function normalizeMachineId(id: unknown): string {
  return String(id || '')
    .trim()
    .replace(/[\s-]+/g, '')
    .toUpperCase();
}

function encryptWhitelistEntries(entries: unknown[]): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', WHITELIST_KEY, iv);
  let enc = cipher.update(JSON.stringify(entries), 'utf8', 'base64');
  enc += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return `${iv.toString('base64')}.${tag}.${enc}`;
}

function getDb(): Firestore {
  if (getApps().length > 0) {
    return getFirestore(getApp());
  }

  const raw = process.env.FIREBASE_KEY?.trim();
  if (!raw) {
    throw new Error(
      'متغير البيئة FIREBASE_KEY غير موجود في إعدادات Vercel. يرجى لصق محتوى firebase-key.json فيه ثم إعادة النشر.'
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'صيغة FIREBASE_KEY في إعدادات Vercel غير صالحة (يجب أن يكون JSON كامل من ملف firebase-key.json).'
    );
  }

  if (!parsed.project_id || !parsed.private_key) {
    throw new Error('ملف FIREBASE_KEY ينقصه project_id أو private_key.');
  }

  if (typeof parsed.private_key === 'string' && parsed.private_key.includes('\\n')) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  const app = initializeApp({
    credential: cert(parsed),
  });
  return getFirestore(app);
}

function setupCorsAndAuth(req: any, res: any): boolean {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-admin-password'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return false;
  }

  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    res.status(500).json({
      error: 'يجب إعداد متغير البيئة ADMIN_PASSWORD في إعدادات Vercel لحماية لوحة التحكم.',
    });
    return false;
  }

  const provided = String(req.headers['x-admin-password'] || '');
  const expectedBuf = Buffer.from(expectedPassword, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  if (
    expectedBuf.length !== providedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    res.status(401).json({ error: 'كلمة مرور لوحة التحكم غير صحيحة' });
    return false;
  }

  return true;
}

function parseBody(req: any): Record<string, any> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

function resolveLicensePayload({
  licenseType,
  durationDays,
  expiresAt,
  existingExpiresAt,
}: {
  licenseType?: string;
  durationDays?: unknown;
  expiresAt?: unknown;
  existingExpiresAt?: string | null;
}) {
  const isTimed = licenseType === 'timed';
  if (!isTimed) {
    return { licenseType: 'lifetime' as const, expiresAt: null };
  }

  if (expiresAt) {
    const raw = String(expiresAt).trim();
    const parsed = new Date(raw.includes('T') ? raw : `${raw}T23:59:59.999Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('تاريخ انتهاء الاشتراك غير صالح');
    }
    return { licenseType: 'timed' as const, expiresAt: parsed.toISOString() };
  }

  const days = Number(durationDays);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('يرجى تحديد عدد أيام صالح للاشتراك المؤقت');
  }

  const existingMs = existingExpiresAt ? Date.parse(existingExpiresAt) : 0;
  const baseMs = Number.isFinite(existingMs) && existingMs > Date.now() ? existingMs : Date.now();
  return {
    licenseType: 'timed' as const,
    expiresAt: new Date(baseMs + days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export default async function handler(req: any, res: any) {
  if (!setupCorsAndAuth(req, res)) return;

  const rawAction = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  const action = String(rawAction || '').trim().toLowerCase();
  const body = parseBody(req);

  try {
    const db = getDb();
    const settingsRef = db.collection('settings').doc('global');
    const devicesRef = db.collection('devices');

    if (action === 'status') {
      const [settingsDoc, devicesSnapshot] = await Promise.all([
        settingsRef.get(),
        devicesRef.get(),
      ]);
      const isLocked = settingsDoc.exists && settingsDoc.data()?.isLocked === true;
      const devices: any[] = [];
      devicesSnapshot.forEach((doc) => {
        devices.push({ id: doc.id, ...doc.data() });
      });
      devices.sort((a, b) => {
        const ta = a.lastSeen ? Date.parse(a.lastSeen) : 0;
        const tb = b.lastSeen ? Date.parse(b.lastSeen) : 0;
        return tb - ta;
      });
      res.status(200).json({ success: true, isLocked, devices });
      return;
    }

    if (action === 'customers') {
      const snapshot = await db.collection('customers_data').get();
      const customers: any[] = [];
      snapshot.forEach((doc) => {
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
      return;
    }

    if (action === 'toggle-lock') {
      const { isLocked } = body;
      await settingsRef.set(
        { isLocked: !!isLocked, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      res.status(200).json({ success: true, isLocked: !!isLocked });
      return;
    }

    if (action === 'add-device') {
      const { machineId, customerName, customerId, licenseType, durationDays, expiresAt } = body;
      const normalizedId = normalizeMachineId(machineId);
      if (!normalizedId || normalizedId.length < 8) {
        res.status(400).json({ error: 'يرجى إدخال كود حاسبة صالح (Machine ID)' });
        return;
      }

      const existingDoc = await devicesRef.doc(normalizedId).get();
      const existingData = existingDoc.exists ? existingDoc.data() || {} : {};
      const resolved = resolveLicensePayload({
        licenseType: licenseType === 'timed' ? 'timed' : 'lifetime',
        durationDays,
        expiresAt,
        existingExpiresAt: existingData.expiresAt,
      });

      const nowIso = new Date().toISOString();
      const payload = {
        isApproved: true,
        licenseType: resolved.licenseType,
        expiresAt: resolved.expiresAt,
        customerName: String(customerName || '').trim() || existingData.customerName || 'عميل جديد',
        customerId: String(customerId || '').trim() || existingData.customerId || 'Customer_1',
        hostname: existingData.hostname || String(customerName || '').trim() || 'جهاز عميل (مضاف مسبقاً)',
        source: 'vendor_whitelist',
        updatedAt: nowIso,
        ...(existingDoc.exists ? {} : { lastSeen: nowIso }),
      };

      await devicesRef.doc(normalizedId).set(payload, { merge: true });
      res.status(200).json({ success: true, device: { id: normalizedId, ...existingData, ...payload } });
      return;
    }

    if (action === 'toggle-device') {
      const { machineId, isApproved, licenseType, durationDays, expiresAt } = body;
      const normalizedId = normalizeMachineId(machineId);
      if (!normalizedId) {
        res.status(400).json({ error: 'Machine ID is required' });
        return;
      }

      const updateData: Record<string, any> = {
        updatedAt: new Date().toISOString(),
      };
      if (typeof isApproved === 'boolean') {
        updateData.isApproved = isApproved;
      }
      if (licenseType === 'lifetime' || licenseType === 'timed') {
        const existingDoc = await devicesRef.doc(normalizedId).get();
        const existingData = existingDoc.exists ? existingDoc.data() || {} : {};
        const resolved = resolveLicensePayload({
          licenseType,
          durationDays,
          expiresAt,
          existingExpiresAt: existingData.expiresAt,
        });
        updateData.licenseType = resolved.licenseType;
        updateData.expiresAt = resolved.expiresAt;
      }

      await devicesRef.doc(normalizedId).set(updateData, { merge: true });
      const updatedDoc = await devicesRef.doc(normalizedId).get();
      res.status(200).json({
        success: true,
        machineId: normalizedId,
        isApproved: updatedDoc.data()?.isApproved === true,
        device: { id: normalizedId, ...updatedDoc.data() },
      });
      return;
    }

    if (action === 'export-whitelist') {
      const { machineId } = body;
      const entries: any[] = [];
      const nowIso = new Date().toISOString();

      if (machineId) {
        const normalizedId = normalizeMachineId(machineId);
        const doc = await devicesRef.doc(normalizedId).get();
        if (!doc.exists || doc.data()?.isApproved !== true) {
          res.status(404).json({ error: 'هذا الجهاز غير مفعل في القائمة' });
          return;
        }
        const d = doc.data()!;
        entries.push({
          machineId: normalizedId,
          customerName: d.customerName || d.hostname || '',
          licenseType: d.licenseType === 'timed' ? 'timed' : 'lifetime',
          expiresAt: d.licenseType === 'timed' ? d.expiresAt || null : null,
          addedAt: d.updatedAt || nowIso,
        });
      } else {
        const snapshot = await devicesRef.get();
        snapshot.forEach((doc) => {
          const d = doc.data();
          if (d.isApproved === true) {
            entries.push({
              machineId: normalizeMachineId(doc.id),
              customerName: d.customerName || d.hostname || '',
              licenseType: d.licenseType === 'timed' ? 'timed' : 'lifetime',
              expiresAt: d.licenseType === 'timed' ? d.expiresAt || null : null,
              addedAt: d.updatedAt || nowIso,
            });
          }
        });
      }

      const content = encryptWhitelistEntries(entries);
      res.status(200).json({ success: true, count: entries.length, filename: 'whitelist.dat', content });
      return;
    }

    if (action === 'lock-all-devices') {
      const snapshot = await devicesRef.get();
      const batch = db.batch();
      const now = new Date().toISOString();
      snapshot.forEach((doc) => {
        batch.set(doc.ref, { isApproved: false, updatedAt: now }, { merge: true });
      });
      await batch.commit();
      res.status(200).json({ success: true, lockedCount: snapshot.size });
      return;
    }

    if (action === 'delete-device') {
      const { machineId } = body;
      const normalizedId = normalizeMachineId(machineId);
      if (!normalizedId) {
        res.status(400).json({ error: 'Machine ID is required' });
        return;
      }
      await devicesRef.doc(normalizedId).delete();
      res.status(200).json({ success: true, machineId: normalizedId });
      return;
    }

    res.status(404).json({ error: `Unknown vendor action: ${action}` });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'حدث خطأ غير متوقع في الخادم' });
  }
}
