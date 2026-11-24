import crypto from 'crypto';

export function setupCorsAndAuth(req: any, res: any): boolean {
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
