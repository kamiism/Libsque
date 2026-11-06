import https from 'node:https';

const tokenCache = new Map();

export async function verifyAppwriteToken(jwt) {
  if (!jwt || typeof jwt !== 'string') return null;

  const cached = tokenCache.get(jwt);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }

  return new Promise((resolve) => {
    const req = https.request(
      'https://cloud.appwrite.io/v1/account',
      {
        method: 'GET',
        headers: {
          'X-Appwrite-Project': '6ae4933f0012901d41e7',
          'X-Appwrite-JWT': jwt,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const user = JSON.parse(data);
              tokenCache.set(jwt, { user, expiresAt: Date.now() + 60000 });
              resolve(user);
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}
